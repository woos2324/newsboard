"""
사설 issue 사후 병합 패스 (canonical issue 재배정)

배경: collect_editorials.py 는 사설마다 gpt-4o 가 독립적으로 issue(쟁점 라벨)를 생성한다.
그 결과 같은 사건도 매체 논조(진보/보수)에 따라 라벨이 갈려 파편화된다.
(예: 북·중 정상회담 → 보수 "북중 회담 비핵화 언급 부재" vs 경향 "북·중 전략적 협력 강화")

이 스크립트는 그날 수집된 사설 전체(제목 + issue)를 gpt-4o 1회 호출로 사건 단위로 묶고,
중립적 canonical issue 라벨을 재배정해 editorial.issue_canonical 에 저장한다.
오늘의 사설 그룹화는 issue_canonical 우선(없으면 issue fallback)으로 동작.

실행: python -m scripts.merge_editorial_issues [--dry-run] [--date YYYYMMDD]
  - --date 미지정(cron 기본): collect_editorials 와 동일하게 어제 + 오늘 둘 다 병합
  - cron: editorials 수집 직후 체이닝 (KST 06:00/14:00/22:00 = UTC 21/05/13)
"""

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx

from scripts.lib.db import get_client

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

KST = timezone(timedelta(hours=9))

# 사설 분석과 동일하게 품질 우선 gpt-4o 고정
MODEL = "gpt-4o"

SYSTEM_PROMPT = """당신은 한국 신문 사설을 사건(이슈) 단위로 분류하는 편집 전문가입니다.

여러 언론사의 사설 목록이 주어집니다. 각 사설에는 임시 쟁점 라벨(issue)이 붙어 있는데,
같은 사건을 다루더라도 언론사 논조에 따라 라벨 표현이 제각각입니다.
당신의 임무는 **같은 사건·사안을 다루는 사설끼리 묶고**, 각 묶음에 **중립적인 사건명 라벨**을 부여하는 것입니다.

반드시 아래 JSON 객체 하나만 반환하세요 (마크다운/설명 텍스트 금지):
{
  "groups": [
    { "canonical_issue": "중립적 사건명 (15자 이내 명사구)", "ids": [사설 id 정수 배열] }
  ]
}

규칙:
- 같은 사건/정책/인물/현안을 다루면 논조가 달라도 한 그룹으로 묶을 것.
  (예: "북중 회담 비핵화 언급 부재"와 "북·중 전략적 협력 강화"는 모두 → "북·중 정상회담")
- canonical_issue 는 진보/보수 어느 쪽 프레임도 아닌 **중립적 사건명**으로. 가치 판단·논조 표현 배제.
- 명백히 다른 사안이면 별도 그룹. 한 사안만 다룬 단독 사설도 그룹 1개로 만들 것(ids 길이 1 허용).
- 입력으로 준 모든 사설 id가 **정확히 하나의 그룹에** 빠짐없이 들어가야 한다. 중복·누락 금지.
- canonical_issue 는 한국어 명사구."""


def clean_text(text: str) -> str:
    return re.sub(r"[\ud800-\udfff]", "", text)


async def merge_with_ai(items: list[dict]) -> Optional[list[dict]]:
    """items: [{editorial_id, title, issue, media}] → [{canonical_issue, ids}] 또는 None."""
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("AI_GATEWAY_API_KEY")
    base_url = os.getenv("AI_BASE_URL", "https://api.openai.com/v1")
    if not api_key or api_key.startswith("PLACEHOLDER"):
        print("  [skip] OPENAI_API_KEY 없음", file=sys.stderr)
        return None

    lines = [
        f"[{it['editorial_id']}] ({it.get('media') or '?'}) issue: {it.get('issue') or '(없음)'} / 제목: {it['title']}"
        for it in items
    ]
    user = "다음 사설들을 사건 단위로 묶고 중립 라벨을 부여하세요:\n\n" + "\n".join(lines)

    async with httpx.AsyncClient() as ai_client:
        for attempt in range(5):
            try:
                resp = await ai_client.post(
                    f"{base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": MODEL,
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": user},
                        ],
                        "temperature": 0.2,
                        "max_tokens": 2000,
                        "response_format": {"type": "json_object"},
                    },
                    timeout=60,
                )
                resp.raise_for_status()
                raw = resp.json()["choices"][0]["message"]["content"].strip()
                parsed = json.loads(raw)
                groups = parsed.get("groups")
                if isinstance(groups, list):
                    return groups
                return None
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    wait = min(30 * (2 ** attempt), 480)
                    print(f"  [rate limit] {wait}초 대기 후 재시도 ({attempt+1}/5)...", file=sys.stderr)
                    await asyncio.sleep(wait)
                else:
                    print(f"  [AI error] {e}", file=sys.stderr)
                    return None
            except Exception as e:
                print(f"  [AI error] {e}", file=sys.stderr)
                return None
    return None


async def process_date(supabase, edition_date: str, dry_run: bool) -> None:
    """단일 날짜(YYYY-MM-DD) 사설들의 issue_canonical 재배정."""
    rows = supabase.table("editorial") \
        .select("editorial_id,title,issue,media_company(name)") \
        .eq("edition_date", edition_date) \
        .not_.is_("issue", "null") \
        .execute()

    items = []
    for r in rows.data:
        mc = r.get("media_company") or {}
        items.append({
            "editorial_id": r["editorial_id"],
            "title": r["title"],
            "issue": r.get("issue"),
            "media": mc.get("name") if isinstance(mc, dict) else None,
        })

    print(f"[{edition_date}] issue 있는 사설: {len(items)}건")
    if len(items) < 2:
        # 0~1건이면 병합 의미 없음 — 있으면 자기 issue 를 canonical 로 복사
        for it in items:
            if not dry_run:
                supabase.table("editorial").update({"issue_canonical": it["issue"]}) \
                    .eq("editorial_id", it["editorial_id"]).execute()
        print("  [skip] 병합 대상 2건 미만")
        return

    groups = await merge_with_ai(items)
    if not groups:
        print("  [skip] AI 병합 실패 — issue_canonical 미변경")
        return

    # id → canonical 매핑 구성 + 검증
    id_to_canonical: dict[int, str] = {}
    valid_ids = {it["editorial_id"] for it in items}
    for g in groups:
        canonical = (g.get("canonical_issue") or "").strip()
        ids = g.get("ids") or []
        if not canonical:
            continue
        for eid in ids:
            if eid in valid_ids:
                id_to_canonical[eid] = canonical

    # 누락분 fallback: AI가 빠뜨린 id 는 원래 issue 를 canonical 로
    issue_by_id = {it["editorial_id"]: it["issue"] for it in items}
    missing = valid_ids - set(id_to_canonical.keys())
    for eid in missing:
        id_to_canonical[eid] = issue_by_id[eid]
    if missing:
        print(f"  [warn] AI 누락 {len(missing)}건 → 원본 issue 로 fallback")

    # 그룹 요약 출력
    canon_count: dict[str, int] = {}
    for c in id_to_canonical.values():
        canon_count[c] = canon_count.get(c, 0) + 1
    merged = {c: n for c, n in canon_count.items() if n >= 2}
    print(f"  → {len(canon_count)}개 사건 (멀티-매체 {len(merged)}개): "
          + ", ".join(f"{c}({n})" for c, n in sorted(merged.items(), key=lambda x: -x[1])))

    if dry_run:
        for it in items:
            print(f"    [dry] [{it['editorial_id']}] {it['issue']} → {id_to_canonical[it['editorial_id']]}")
        return

    updated = 0
    for eid, canonical in id_to_canonical.items():
        supabase.table("editorial").update({"issue_canonical": canonical}) \
            .eq("editorial_id", eid).execute()
        updated += 1
    print(f"  [ok] {updated}건 issue_canonical 갱신")


async def main(dry_run: bool, date: Optional[str]) -> None:
    print(f"[merge_editorial_issues] dry_run={dry_run} date={date or 'cron(어제+오늘)'}")
    supabase = get_client()

    if date:
        edition_date = f"{date[:4]}-{date[4:6]}-{date[6:8]}"
        await process_date(supabase, edition_date, dry_run)
        return

    # cron 기본: collect_editorials 와 동일하게 어제 + 오늘 둘 다 병합
    today = datetime.now(KST).strftime("%Y%m%d")
    yesterday = (datetime.now(KST) - timedelta(days=1)).strftime("%Y%m%d")
    for d in (yesterday, today):
        await process_date(supabase, f"{d[:4]}-{d[4:6]}-{d[6:8]}", dry_run)
        print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--date", type=str, help="병합 날짜 YYYYMMDD (기본: 어제+오늘)")
    args = parser.parse_args()
    asyncio.run(main(args.dry_run, args.date))
