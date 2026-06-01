"""기자 문체 프로파일 일괄 생성 — reporter_style_profile 테이블 저장.

OpenSearch에서 기자별 대표 기사를 가져와 gpt-4o로 문체 분석 후 저장.
오픈 전 선학습 가능 (reporter_id 키, 계정 비의존).

실행 예시:
    # 전체 기자 (segye.com, 기사 10건 이상)
    python -m scripts.generate_style_profiles --all

    # 특정 기자만
    python -m scripts.generate_style_profiles --reporter-id hyj0709

    # 상위 N명만 (테스트용)
    python -m scripts.generate_style_profiles --all --limit 5 --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from typing import Optional

import httpx

from scripts.lib.db import get_client
from scripts.lib.opensearch_client import get_articles_by_reporter, list_reporters

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

MODEL = "gpt-4o"
ARTICLES_PER_REPORTER = 15  # 문체 학습에 쓸 기사 수

STYLE_SCHEMA = {
    "lead_style": "연성: 장면 묘사형 / 경성: 스트레이트형 (구체 예시 포함)",
    "avg_sentence_length": "짧은 단문 / 만연체 (특징 서술)",
    "tone": "건조·객관 / 분석적 / 현장감 (구체 서술)",
    "structure": "역피라미드 / 내러티브 / 기타",
    "number_handling": "수치 처리·병기 방식 (예: 괄호 병기, % 표기 등)",
    "comparison_pattern": "과거 대비 변화 제시 여부 및 방식",
    "quote_handling": "인용 배치·처리 방식 (위치, 빈도, 형식)",
    "ending_style": "마무리 패턴 (전망·함의 제시 여부)",
    "frequent_expressions": ["자주 쓰는 표현·어미·접속어 3~5개"],
    "notes": "기타 두드러진 특징 (제목 패턴, 구어체 여부 등)",
}

SYSTEM_PROMPT = """당신은 신문 기자의 문체를 분석하는 전문가입니다.
아래 기사들을 읽고 이 기자의 **문체 특성**을 분석해 JSON으로 정리하세요.

[분석 원칙]
- 개별 기사의 내용(사건, 인물)이 아니라 '어떻게 쓰는가'에 집중하세요.
- 리드 문장 유형, 문장 길이, 톤, 구조, 수치 처리, 인용 배치, 마무리 패턴을 관찰하세요.
- 기사가 여러 유형(경성/연성)이면 각각의 특성을 구분해 서술하세요.
- 출력은 아래 JSON 스키마만. 다른 텍스트 없이 JSON만 반환.

[JSON 스키마]
""" + json.dumps(STYLE_SCHEMA, ensure_ascii=False, indent=2)


async def call_gpt4o(articles: list[dict]) -> Optional[dict]:
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("AI_GATEWAY_API_KEY")
    base_url = os.getenv("AI_BASE_URL", "https://api.openai.com/v1")

    if not api_key or api_key.startswith("PLACEHOLDER"):
        print("  [error] OPENAI_API_KEY 없음", file=sys.stderr)
        return None

    # 기사 본문 조합 (제목 + 본문 앞 500자)
    article_text = ""
    for i, a in enumerate(articles, 1):
        body = (a.get("body") or "").strip()[:500]
        article_text += f"\n---[기사 {i}] {a.get('title', '')}\n{body}\n"

    async with httpx.AsyncClient() as client:
        for attempt in range(5):
            try:
                resp = await client.post(
                    f"{base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": MODEL,
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": f"[기사 모음]\n{article_text}"},
                        ],
                        "temperature": 0.2,
                        "response_format": {"type": "json_object"},
                    },
                    timeout=60,
                )
                resp.raise_for_status()
                raw = resp.json()["choices"][0]["message"]["content"]
                return json.loads(raw)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    wait = min(30 * (2 ** attempt), 480)
                    print(f"  [rate limit] {wait}s 대기 ({attempt+1}/5)...", file=sys.stderr)
                    await asyncio.sleep(wait)
                else:
                    print(f"  [AI error] {e}", file=sys.stderr)
                    return None
            except Exception as e:
                print(f"  [AI error] {type(e).__name__}: {e}", file=sys.stderr)
                return None
    return None


def _upsert_profile(
    reporter_id: str,
    reporter_name: str,
    profile: dict,
    samples: list[dict],
    article_count: int,
    dry_run: bool,
) -> None:
    if dry_run:
        print(f"  [dry] upsert 생략 — profile keys: {list(profile.keys())}")
        return
    sb = get_client()
    # few-shot 샘플: 제목 + 본문 앞 300자만 저장
    sample_data = [
        {"title": a.get("title"), "body": (a.get("body") or "")[:300], "published_at": a.get("published_at")}
        for a in samples[:5]
    ]
    sb.table("reporter_style_profile").upsert({
        "reporter_id": reporter_id,
        "reporter_name": reporter_name,
        "profile": profile,
        "sample_articles": sample_data,
        "article_count": article_count,
        "generated_at": "now()",
        "model": MODEL,
    }, on_conflict="reporter_id").execute()


async def generate_one(
    reporter_id: str,
    reporter_name: str,
    dry_run: bool,
) -> bool:
    articles = get_articles_by_reporter(reporter_id, size=ARTICLES_PER_REPORTER)
    if not articles:
        print(f"  [skip] 기사 없음")
        return False

    # reporter_name을 기사에서 채움
    name = articles[0].get("reporter") or reporter_name or reporter_id
    count = len(articles)
    print(f"  기사 {count}건 수집 → gpt-4o 분석 중...")

    profile = await call_gpt4o(articles)
    if not profile:
        print(f"  [fail] 프로파일 생성 실패")
        return False

    _upsert_profile(reporter_id, name, profile, articles, count, dry_run)
    lead = profile.get("lead_style", "")[:60]
    print(f"  [ok] {name}({reporter_id}) | lead: {lead}")
    return True


async def main(
    reporter_id: Optional[str],
    do_all: bool,
    domain: str,
    limit: int,
    dry_run: bool,
    skip_existing: bool,
) -> None:
    if reporter_id:
        targets = [{"reporter_id": reporter_id, "reporter_name": reporter_id, "article_count": 0}]
    elif do_all:
        print(f"[1] OpenSearch에서 기자 목록 조회 (domain={domain})...")
        targets = list_reporters(domain=domain, min_articles=5, date_from="2025-01-01")
        print(f"  총 {len(targets)}명")
        if limit:
            targets = targets[:limit]
            print(f"  → 상위 {limit}명만 처리")
    else:
        print("--reporter-id 또는 --all 옵션이 필요합니다.", file=sys.stderr)
        sys.exit(1)

    if skip_existing:
        sb = get_client()
        existing = {
            r["reporter_id"]
            for r in sb.table("reporter_style_profile").select("reporter_id").execute().data
        }
        before = len(targets)
        targets = [t for t in targets if t["reporter_id"] not in existing]
        print(f"  기존 프로파일 {before - len(targets)}명 건너뜀 → 신규 {len(targets)}명")

    success = fail = 0
    for i, t in enumerate(targets, 1):
        rid = t["reporter_id"]
        name = t.get("reporter_name", rid)
        print(f"\n[{i}/{len(targets)}] {name}({rid}) — {t.get('article_count', '?')}건")
        ok = await generate_one(rid, name, dry_run)
        if ok:
            success += 1
        else:
            fail += 1
        # 연속 호출 간 간격 (rate limit 분산)
        if i < len(targets):
            await asyncio.sleep(3)

    print(f"\n[완료] 성공 {success}명 / 실패 {fail}명 (dry_run={dry_run})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reporter-id", type=str, help="특정 기자 reporter_id")
    parser.add_argument("--all", dest="do_all", action="store_true", help="전체 기자 처리")
    parser.add_argument("--domain", type=str, default="segye.com", help="이메일 도메인 필터")
    parser.add_argument("--limit", type=int, default=0, help="처리할 최대 기자 수 (0=무제한)")
    parser.add_argument("--dry-run", action="store_true", help="DB 저장 없이 출력만")
    parser.add_argument("--skip-existing", action="store_true", help="이미 프로파일 있는 기자 건너뜀")
    args = parser.parse_args()
    asyncio.run(main(
        args.reporter_id, args.do_all, args.domain,
        args.limit, args.dry_run, args.skip_existing,
    ))
