"""
사설 수집 + AI 성향 분석 스크립트

수집 대상: https://news.naver.com/opinion/editorial (네이버 사설 전용 페이지)
분석: gpt-4o-mini로 요약 + 성향 점수(-2~+2) + 주제 분류
실행: python -m scripts.collect_editorials [--dry-run] [--date YYYYMMDD]
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
from bs4 import BeautifulSoup

from scripts.lib.db import get_client

# Windows 콘솔 기본 cp949에서 한글 방점(〮) 등 일부 유니코드 문자가 print 시 크래시되는 문제 방지.
# GitHub Actions(Linux)는 기본 UTF-8이라 영향 없음.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

KST = timezone(timedelta(hours=9))

EDITORIAL_URL = "https://news.naver.com/opinion/editorial"
EDITORIAL_API_URL = "https://news.naver.com/opinion/editorial/api"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
}

API_HEADERS = {
    **HEADERS,
    "Accept": "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": EDITORIAL_URL,
}

# 수집 대상 매체 (15개): 9대 종합일간지 + 3대 경제지 + 문화일보 + 헤럴드경제 + 동행미디어시대
ALLOWED_MEDIA_IDS: set[int] = {1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 19, 60}

BASE_SYSTEM_PROMPT = """당신은 언론사 사설을 분석하는 전문가입니다.
다음 사설을 읽고 JSON 형식으로 분석하세요.

반드시 아래 JSON만 반환하세요 (다른 텍스트 없이):
{{
  "summary": "사설 핵심 내용 2~3문장 요약",
  "topic": "정치|경제|사회|외교|문화|과학|기타 중 하나",
  "issue": "이 사설이 다루는 핵심 쟁점을 15자 이내 명사구로{issue_instruction}",
  "stance_score": -2.0에서 2.0 사이 숫자 (-2=매우진보, 0=중립, 2=매우보수),
  "stance_label": "진보|중도진보|중립|중도보수|보수 중 하나",
  "stance_reason": "이 사설의 성향을 판단한 구체적 근거를 3~4문장으로 서술. 사설에서 사용된 주요 논거·표현·입장을 인용하며 설명할 것"
}}"""


def build_system_prompt(existing_issues: list[str]) -> str:
    """오늘 이미 등록된 issue 목록을 주입해 동일 사안이면 레이블을 재사용하도록 유도."""
    if not existing_issues:
        instruction = " (예: 탄핵 이후 정국 수습, 반도체 파업 대응, 저출생 구조 개혁)"
        return BASE_SYSTEM_PROMPT.format(issue_instruction=instruction)

    issue_list = "\n".join(f"  - {iss}" for iss in existing_issues)
    instruction = (
        f". 아래 오늘의 기존 쟁점 목록에서 동일한 사안이 있으면 반드시 그 표현을 그대로 사용할 것:\n"
        f"{issue_list}\n"
        f"  새로운 사안이면 15자 이내 명사구로 새로 작성"
    )
    return BASE_SYSTEM_PROMPT.format(issue_instruction=instruction)


def clean_text(text: str) -> str:
    return re.sub(r"[\ud800-\udfff]", "", text)


async def fetch_editorial_list(client: httpx.AsyncClient, date: Optional[str] = None) -> list[dict]:
    """네이버 사설 전용 페이지에서 사설 목록 수집. date=YYYYMMDD 지정 시 해당 날짜."""
    url = f"{EDITORIAL_URL}?date={date}" if date else EDITORIAL_URL
    try:
        resp = await client.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        print(f"[fetch error] {url}: {e}", file=sys.stderr)
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    items = []
    for li in soup.select("li.opinion_editorial_item"):
        a = li.select_one("a.link")
        if not a:
            continue
        url = a.get("href", "")
        if not url or "article" not in url:
            continue
        press = li.select_one("strong.press_name")
        desc = li.select_one("p.description")
        press_name = clean_text(press.get_text(strip=True)) if press else ""
        title = clean_text(desc.get_text(strip=True)) if desc else ""
        if not title or not press_name:
            continue
        if any(kw in title for kw in ["석간", "조간"]):
            continue
        items.append({"press_name": press_name, "title": title, "url": url})

    return items


async def fetch_editorial_api_page(client: httpx.AsyncClient, date: str, page: int) -> list[dict]:
    """API로 추가 페이지 수집 (page=2 이상, 스크롤 로딩분)."""
    try:
        resp = await client.get(
            EDITORIAL_API_URL,
            params={"officeId": "", "date": date, "page": page},
            headers=API_HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        contents = data.get("message", {}).get("contents", [])
    except Exception as e:
        print(f"[api error] page={page}: {e}", file=sys.stderr)
        return []

    items = []
    for c in contents:
        press_name = clean_text(c.get("officeName", ""))
        title = clean_text(c.get("title", "").strip())
        url = c.get("linkUrl", "")
        if not title or not press_name or not url or "article" not in url:
            continue
        if any(kw in title for kw in ["석간", "조간"]):
            continue
        items.append({"press_name": press_name, "title": title, "url": url})
    return items


async def fetch_article_body(client: httpx.AsyncClient, url: str) -> tuple[Optional[str], Optional[str]]:
    """본문과 발행 시각(ISO8601+09:00)을 반환."""
    try:
        resp = await client.get(url, headers=HEADERS, timeout=15, follow_redirects=True)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # 발행 시각: data-date-time="2026-05-14 11:13:05"
        published_at = None
        dt_el = soup.select_one(".media_end_head_info_datestamp_time[data-date-time]")
        if dt_el:
            raw = dt_el.get("data-date-time", "").strip()
            if raw:
                published_at = raw.replace(" ", "T") + "+09:00"

        body = None
        for sel in ["#dic_area", "#articleBodyContents", ".newsct_article", "#articeBody"]:
            el = soup.select_one(sel)
            if el:
                for tag in el.find_all(['br', 'p']):
                    tag.insert_before('\n')
                body = clean_text(el.get_text("", strip=False).strip())[:3000]
                break

        return body, published_at
    except Exception:
        return None, None


async def analyze_with_ai(title: str, body: Optional[str], existing_issues: list[str] | None = None) -> Optional[dict]:
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("AI_GATEWAY_API_KEY")
    base_url = os.getenv("AI_BASE_URL", "https://api.openai.com/v1")
    # 사설 분석은 품질 우선 — gpt-4o 고정 (다른 스크립트의 DEFAULT_AI_MODEL과 별개)
    model = "gpt-4o"

    if not api_key or api_key.startswith("PLACEHOLDER"):
        return None

    content = f"제목: {title}\n\n본문:\n{body or '(본문 없음)'}"
    system_prompt = build_system_prompt(existing_issues or [])

    async with httpx.AsyncClient() as ai_client:
        for attempt in range(3):
            try:
                resp = await ai_client.post(
                    f"{base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": content},
                        ],
                        "temperature": 0.3,
                        "max_tokens": 800,
                    },
                    timeout=30,
                )
                resp.raise_for_status()
                raw = resp.json()["choices"][0]["message"]["content"].strip()
                m = re.search(r"\{.*\}", raw, re.DOTALL)
                if m:
                    return json.loads(m.group())
                return None
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    wait = 60 * (attempt + 1)
                    print(f"  [rate limit] {wait}초 대기 후 재시도 ({attempt+1}/3)...", file=sys.stderr)
                    await asyncio.sleep(wait)
                else:
                    print(f"  [AI error] {e}", file=sys.stderr)
                    return None
            except Exception as e:
                print(f"  [AI error] {e}", file=sys.stderr)
                return None
    return None


async def reanalyze_issue(supabase) -> None:
    """issue 컬럼이 비어있는 기존 레코드를 AI로 재분석."""
    rows = supabase.table("editorial").select("editorial_id,title,body").is_("issue", "null").execute()
    print(f"[reanalyze] issue 없는 레코드: {len(rows.data)}건")
    async with httpx.AsyncClient() as http_client:
        for row in rows.data:
            ai = await analyze_with_ai(row["title"], row["body"])
            if ai and ai.get("issue"):
                supabase.table("editorial").update({
                    "issue": ai.get("issue"),
                    "ai_analysis": ai,
                }).eq("editorial_id", row["editorial_id"]).execute()
                print(f"  [ok] {row['title'][:40]} | {ai.get('issue')}")
            else:
                print(f"  [skip] {row['title'][:40]}")


async def reanalyze_by_date(supabase, date: str) -> None:
    """특정 날짜(YYYYMMDD)의 사설 전체를 AI로 재분석. issue 레이블 누적 적용."""
    edition_date = f"{date[:4]}-{date[4:6]}-{date[6:8]}"
    rows = supabase.table("editorial").select("editorial_id,title,body") \
        .eq("edition_date", edition_date).execute()
    print(f"[reanalyze-date] {date} 사설: {len(rows.data)}건")

    existing_issues: list[str] = []
    for row in rows.data:
        ai = await analyze_with_ai(row["title"], row["body"], existing_issues)
        await asyncio.sleep(1)  # rate limit 방지
        if ai:
            supabase.table("editorial").update({
                "summary": ai.get("summary"),
                "topic": ai.get("topic"),
                "issue": ai.get("issue"),
                "stance_score": ai.get("stance_score"),
                "stance_label": ai.get("stance_label"),
                "ai_analysis": ai,
            }).eq("editorial_id", row["editorial_id"]).execute()
            print(f"  [ok] {row['title'][:40]} | {ai.get('stance_label')} | {ai.get('issue')}")
            new_issue = ai.get("issue")
            if new_issue and new_issue not in existing_issues:
                existing_issues.append(new_issue)
        else:
            print(f"  [skip] {row['title'][:40]}")


async def main(dry_run: bool, date: Optional[str] = None, reanalyze: bool = False, reanalyze_date: Optional[str] = None, backfill_days: int = 0, date_from: Optional[str] = None, date_to: Optional[str] = None):
    print(f"[collect_editorials] dry_run={dry_run} date={date or 'today'} backfill_days={backfill_days} date_from={date_from} date_to={date_to}")

    # 날짜 범위 백필: --date-from ~ --date-to (과거→최신 순)
    if date_from and date_to:
        dt_from = datetime(int(date_from[:4]), int(date_from[4:6]), int(date_from[6:8]), tzinfo=KST)
        dt_to   = datetime(int(date_to[:4]),   int(date_to[4:6]),   int(date_to[6:8]),   tzinfo=KST)
        total = (dt_to - dt_from).days + 1
        print(f"[range-backfill] {date_from} ~ {date_to} ({total}일)")
        for i in range(total):
            target = (dt_from + timedelta(days=i)).strftime("%Y%m%d")
            print(f"\n[backfill] {target} ({i+1}/{total})")
            await main(dry_run=dry_run, date=target)
        return

    # 오늘부터 N일 전까지 순차 수집
    if backfill_days > 0:
        base = datetime.now(KST)
        for i in range(1, backfill_days + 1):
            target = (base - timedelta(days=i)).strftime("%Y%m%d")
            print(f"\n[backfill] {target} ({i}/{backfill_days})")
            await main(dry_run=dry_run, date=target)
        return

    if reanalyze_date and not dry_run:
        supabase = get_client()
        await reanalyze_by_date(supabase, reanalyze_date)
        return

    if reanalyze and not dry_run:
        supabase = get_client()
        await reanalyze_issue(supabase)
        return

    # date 미지정 (cron 기본 모드): 어제+오늘 둘 다 수집.
    # Why: GitHub Actions cron 지연으로 KST 자정을 넘어 실행되면 datetime.now(KST)가 다음 날을 가리켜
    # 전날 사설이 누락됨 (특히 매일경제처럼 Naver가 다음날 버킷에 안 넣어주는 매체).
    # 이미 DB에 있는 URL은 AI 재호출 없이 메타데이터만 업데이트되므로 비용 영향 미미.
    if date is None:
        today = datetime.now(KST).strftime("%Y%m%d")
        yesterday = (datetime.now(KST) - timedelta(days=1)).strftime("%Y%m%d")
        print(f"[cron-mode] 어제({yesterday}) + 오늘({today}) 순차 수집")
        await main(dry_run=dry_run, date=yesterday)
        print()
        await main(dry_run=dry_run, date=today)
        return

    supabase = get_client() if not dry_run else None

    # DB에서 매체명 → media_company_id 매핑
    if not dry_run:
        mc_rows = supabase.table("media_company").select("media_company_id,name,normalized_name").execute()
        name_map = {r["name"]: r["media_company_id"] for r in mc_rows.data}
    else:
        name_map = {}

    # published_at + edition_date 계산
    if date:
        dt = datetime(int(date[:4]), int(date[4:6]), int(date[6:8]), tzinfo=KST)
    else:
        dt = datetime.now(KST).replace(hour=0, minute=0, second=0, microsecond=0)
    api_date = date or datetime.now(KST).strftime("%Y%m%d")
    edition_date = f"{api_date[:4]}-{api_date[4:6]}-{api_date[6:8]}"

    # 당일 이미 저장된 issue 목록 미리 로드 (AI 레이블 일관성 확보)
    existing_issues: list[str] = []
    if not dry_run:
        existing_rows = supabase.table("editorial") \
            .select("issue") \
            .eq("edition_date", edition_date) \
            .not_.is_("issue", "null") \
            .execute()
        existing_issues = list({r["issue"] for r in existing_rows.data if r["issue"]})
        print(f"  기존 issue 목록: {len(existing_issues)}건")

    async with httpx.AsyncClient() as http_client:
        items = await fetch_editorial_list(http_client, date)

        # API로 page=1부터 전체 수집 (HTML 스크래핑 보완 + 누락 방지)
        page = 1
        page = 1
        while True:
            extra = await fetch_editorial_api_page(http_client, api_date, page)
            if not extra:
                break
            items.extend(extra)
            page += 1

        # URL 중복 제거
        seen: set[str] = set()
        unique_items = []
        for item in items:
            if item["url"] not in seen:
                seen.add(item["url"])
                unique_items.append(item)
        items = unique_items

        print(f"  수집된 사설: {len(items)}건 (HTML+API {page-1}페이지)")

        if not items:
            print("  [경고] 사설 목록을 가져오지 못했습니다.")
            return

        saved = 0
        skipped_media = 0
        for item in items:
            url = item["url"]
            title = item["title"]
            press_name = item["press_name"]
            mc_id = name_map.get(press_name)

            # 수집 대상 외 매체 스킵
            if mc_id not in ALLOWED_MEDIA_IDS:
                skipped_media += 1
                continue

            if not dry_run:
                existing = supabase.table("editorial").select("editorial_id,media_company_id").eq("url", url).execute()
                if existing.data:
                    # 기존 레코드: media_company_id(null인 경우)와 published_at, edition_date 업데이트
                    body, article_published_at = await fetch_article_body(http_client, url)
                    update_fields: dict = {"edition_date": edition_date}
                    if existing.data[0]["media_company_id"] is None and mc_id is not None:
                        update_fields["media_company_id"] = mc_id
                    if article_published_at:
                        update_fields["published_at"] = article_published_at
                    if update_fields:
                        supabase.table("editorial").update(update_fields).eq("url", url).execute()
                        print(f"  [updated] {press_name}: {title[:30]} | fields={list(update_fields.keys())}")
                    else:
                        print(f"  [skip] {press_name}: {title[:30]}")
                    continue

            body, article_published_at = await fetch_article_body(http_client, url)
            body_preview = f"{len(body)}자" if body else "본문 없음"

            ai = await analyze_with_ai(title, body, existing_issues)
            await asyncio.sleep(1)  # rate limit 방지

            published_at = article_published_at or dt.isoformat()

            row = {
                "media_company_id": mc_id,
                "title": title,
                "url": url,
                "body": body,
                "published_at": published_at,
                "edition_date": edition_date,
                "summary": ai.get("summary") if ai else None,
                "topic": ai.get("topic") if ai else None,
                "issue": ai.get("issue") if ai else None,
                "stance_score": ai.get("stance_score") if ai else None,
                "stance_label": ai.get("stance_label") if ai else None,
                "ai_analysis": ai,
            }

            if dry_run:
                print(f"  [dry] [{press_name}] {title[:40]}")
                print(f"        본문: {body_preview} | AI: {ai}")
            else:
                supabase.table("editorial").upsert(row, on_conflict="url").execute()
                print(f"  [saved] [{press_name}] {title[:40]} | stance={ai.get('stance_score') if ai else 'N/A'} | issue={ai.get('issue') if ai else 'N/A'}")
                saved += 1
                # 새 issue를 누적해 다음 사설 분석 시 재사용 유도
                new_issue = ai.get("issue") if ai else None
                if new_issue and new_issue not in existing_issues:
                    existing_issues.append(new_issue)

    if not dry_run:
        print(f"[collect_editorials] 완료: {saved}건 저장 / {skipped_media}건 대상 외 매체 스킵")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--date", type=str, help="수집 날짜 YYYYMMDD (기본: 오늘)")
    parser.add_argument("--reanalyze", action="store_true", help="issue 없는 기존 레코드 AI 재분석")
    parser.add_argument("--reanalyze-date", type=str, help="특정 날짜 사설 전체 재분석 YYYYMMDD")
    parser.add_argument("--backfill-days", type=int, default=0, help="오늘부터 N일 전까지 순차 백필 수집")
    parser.add_argument("--date-from", type=str, help="수집 시작일 YYYYMMDD")
    parser.add_argument("--date-to", type=str, help="수집 종료일 YYYYMMDD")
    args = parser.parse_args()
    asyncio.run(main(args.dry_run, args.date, args.reanalyze, args.reanalyze_date, args.backfill_days, args.date_from, args.date_to))
