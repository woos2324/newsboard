"""
사설 수집 + AI 성향 분석 스크립트

수집 대상: 주요 언론사 네이버 뉴스 사설 섹션
분석: gpt-4o-mini로 요약 + 성향 점수(-2~+2) + 주제 분류
실행: python -m scripts.collect_editorials [--dry-run] [--date YYYYMMDD]
"""

import argparse
import asyncio
import json
import re
import sys
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from scripts.lib.db import get_client

KST = timezone(timedelta(hours=9))

TARGETS = [
    {"normalized_name": "segye",    "naver_media_id": "022", "section_id": "110"},
    {"normalized_name": "chosun",   "naver_media_id": "023", "section_id": "110"},
    {"normalized_name": "joongang", "naver_media_id": "025", "section_id": "110"},
    {"normalized_name": "donga",    "naver_media_id": "020", "section_id": "110"},
    {"normalized_name": "hani",     "naver_media_id": "028", "section_id": "110"},
    {"normalized_name": "khan",     "naver_media_id": "032", "section_id": "110"},
    {"normalized_name": "hk",       "naver_media_id": "469", "section_id": "110"},
    {"normalized_name": "munhwa",   "naver_media_id": "021", "section_id": "110"},
    {"normalized_name": "kmib",     "naver_media_id": "005", "section_id": "110"},
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
}

SYSTEM_PROMPT = """당신은 언론사 사설을 분석하는 전문가입니다.
다음 사설을 읽고 JSON 형식으로 분석하세요.

반드시 아래 JSON만 반환하세요 (다른 텍스트 없이):
{
  "summary": "사설 핵심 내용 2~3문장 요약",
  "topic": "정치|경제|사회|외교|문화|과학|기타 중 하나",
  "stance_score": -2.0에서 2.0 사이 숫자 (-2=매우진보, 0=중립, 2=매우보수),
  "stance_label": "진보|중도진보|중립|중도보수|보수 중 하나",
  "stance_reason": "성향 판단 근거 1문장"
}"""


async def fetch_editorial_list(client: httpx.AsyncClient, oid: str, date_str: str) -> list[dict]:
    url = f"https://news.naver.com/main/list.naver?mode=LPOD&mid=sec&oid={oid}&sid1=110&date={date_str}&page=1"
    try:
        resp = await client.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        print(f"  [fetch error] oid={oid}: {e}", file=sys.stderr)
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    articles = []
    for dt in soup.select("dt:not(.photo)"):
        a = dt.find("a", href=True)
        if not a:
            continue
        href = a["href"]
        if "article" not in href:
            continue
        title = a.get_text(strip=True)
        if not title:
            continue
        articles.append({"title": title, "url": href})

    return articles[:3]


async def fetch_article_body(client: httpx.AsyncClient, url: str) -> Optional[str]:
    try:
        resp = await client.get(url, headers=HEADERS, timeout=15, follow_redirects=True)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for sel in ["#dic_area", "#articleBodyContents", ".newsct_article", "#articeBody"]:
            el = soup.select_one(sel)
            if el:
                return el.get_text(" ", strip=True)[:3000]
        return None
    except Exception:
        return None


async def analyze_with_ai(title: str, body: Optional[str]) -> Optional[dict]:
    import os
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("AI_GATEWAY_API_KEY")
    base_url = os.getenv("AI_BASE_URL", "https://api.openai.com/v1")
    model = os.getenv("DEFAULT_AI_MODEL", "gpt-4o-mini")

    if not api_key or api_key.startswith("PLACEHOLDER"):
        return None

    content = f"제목: {title}\n\n본문:\n{body or '(본문 없음)'}"

    async with httpx.AsyncClient() as ai_client:
        try:
            resp = await ai_client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": content},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 400,
                },
                timeout=30,
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"].strip()
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            if m:
                return json.loads(m.group())
        except Exception as e:
            print(f"  [AI error] {e}", file=sys.stderr)
    return None


async def process_media(
    http_client: httpx.AsyncClient,
    target: dict,
    media_company_id: int,
    date_str: str,
    dry_run: bool,
    supabase,
) -> int:
    oid = target["naver_media_id"]
    name = target["normalized_name"]

    articles = await fetch_editorial_list(http_client, oid, date_str)
    if not articles:
        print(f"  [{name}] 사설 없음")
        return 0

    saved = 0
    for art in articles:
        url = art["url"]
        title = art["title"]

        if not dry_run:
            existing = supabase.table("editorial").select("editorial_id").eq("url", url).execute()
            if existing.data:
                print(f"  [{name}] skip (already exists): {title[:30]}")
                continue

        body = await fetch_article_body(http_client, url)
        ai = await analyze_with_ai(title, body)

        published_at = datetime.now(KST).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

        row = {
            "media_company_id": media_company_id,
            "title": title,
            "url": url,
            "body": body,
            "published_at": published_at,
            "summary": ai.get("summary") if ai else None,
            "topic": ai.get("topic") if ai else None,
            "stance_score": ai.get("stance_score") if ai else None,
            "stance_label": ai.get("stance_label") if ai else None,
            "ai_analysis": ai,
        }

        if dry_run:
            print(f"  [dry] [{name}] {title[:40]} | {ai}")
        else:
            supabase.table("editorial").upsert(row, on_conflict="url").execute()
            print(f"  [{name}] saved: {title[:40]} | stance={ai.get('stance_score') if ai else 'N/A'}")
            saved += 1

    return saved


async def main(date_str: str, dry_run: bool):
    print(f"[collect_editorials] date={date_str} dry_run={dry_run}")

    supabase = get_client() if not dry_run else None

    if not dry_run:
        mc_rows = supabase.table("media_company").select("media_company_id,normalized_name").execute()
        mc_map = {r["normalized_name"]: r["media_company_id"] for r in mc_rows.data}
    else:
        mc_map = {t["normalized_name"]: i + 1 for i, t in enumerate(TARGETS)}

    async with httpx.AsyncClient() as http_client:
        tasks = []
        for target in TARGETS:
            mc_id = mc_map.get(target["normalized_name"])
            if mc_id is None:
                print(f"  [skip] {target['normalized_name']} not in DB")
                continue
            tasks.append(process_media(http_client, target, mc_id, date_str, dry_run, supabase))

        results = await asyncio.gather(*tasks)

    total = sum(results)
    print(f"[collect_editorials] 완료: {total}건 저장")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--date", default=datetime.now(KST).strftime("%Y%m%d"))
    args = parser.parse_args()
    asyncio.run(main(args.date, args.dry_run))
