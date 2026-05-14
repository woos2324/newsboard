"""
사설 수집 + AI 성향 분석 스크립트

수집 대상: https://news.naver.com/opinion/editorial (네이버 사설 전용 페이지)
분석: gpt-4o-mini로 요약 + 성향 점수(-2~+2) + 주제 분류
실행: python -m scripts.collect_editorials [--dry-run]
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

KST = timezone(timedelta(hours=9))

EDITORIAL_URL = "https://news.naver.com/opinion/editorial"

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


def clean_text(text: str) -> str:
    return re.sub(r"[\ud800-\udfff]", "", text)


async def fetch_editorial_list(client: httpx.AsyncClient) -> list[dict]:
    """네이버 사설 전용 페이지에서 오늘의 사설 목록 수집."""
    try:
        resp = await client.get(EDITORIAL_URL, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        print(f"[fetch error] {EDITORIAL_URL}: {e}", file=sys.stderr)
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
        items.append({"press_name": press_name, "title": title, "url": url})

    return items


async def fetch_article_body(client: httpx.AsyncClient, url: str) -> Optional[str]:
    try:
        resp = await client.get(url, headers=HEADERS, timeout=15, follow_redirects=True)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for sel in ["#dic_area", "#articleBodyContents", ".newsct_article", "#articeBody"]:
            el = soup.select_one(sel)
            if el:
                return clean_text(el.get_text(" ", strip=True))[:3000]
        return None
    except Exception:
        return None


async def analyze_with_ai(title: str, body: Optional[str]) -> Optional[dict]:
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


async def main(dry_run: bool):
    print(f"[collect_editorials] dry_run={dry_run}")

    supabase = get_client() if not dry_run else None

    # DB에서 매체명 → media_company_id 매핑
    if not dry_run:
        mc_rows = supabase.table("media_company").select("media_company_id,name,normalized_name").execute()
        name_map = {r["name"]: r["media_company_id"] for r in mc_rows.data}
    else:
        name_map = {}

    async with httpx.AsyncClient() as http_client:
        items = await fetch_editorial_list(http_client)
        print(f"  수집된 사설: {len(items)}건")

        if not items:
            print("  [경고] 사설 목록을 가져오지 못했습니다.")
            return

        saved = 0
        for item in items:
            url = item["url"]
            title = item["title"]
            press_name = item["press_name"]
            mc_id = name_map.get(press_name)

            if not dry_run:
                existing = supabase.table("editorial").select("editorial_id").eq("url", url).execute()
                if existing.data:
                    print(f"  [skip] {press_name}: {title[:30]}")
                    continue

            body = await fetch_article_body(http_client, url)
            body_preview = f"{len(body)}자" if body else "본문 없음"

            ai = await analyze_with_ai(title, body)

            published_at = datetime.now(KST).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

            row = {
                "media_company_id": mc_id,
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
                print(f"  [dry] [{press_name}] {title[:40]}")
                print(f"        본문: {body_preview} | AI: {ai}")
            else:
                supabase.table("editorial").upsert(row, on_conflict="url").execute()
                print(f"  [saved] [{press_name}] {title[:40]} | stance={ai.get('stance_score') if ai else 'N/A'}")
                saved += 1

    if not dry_run:
        print(f"[collect_editorials] 완료: {saved}건 저장")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(args.dry_run))
