"""Washington Times 사설 수집기 (무료, httpx 직접).

인덱스: https://www.washingtontimes.com/opinion/editorials/
"""
from __future__ import annotations

import asyncio
import re
import sys
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from scripts.lib.foreign_collectors.base import ForeignEditorialItem

INDEX_URL = "https://www.washingtontimes.com/opinion/editorials/"
BASE = "https://www.washingtontimes.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
}


def _looks_like_editorial_url(href: str) -> bool:
    # 정상 사설 URL 예: /opinion/2026/may/22/title-slug/
    return bool(re.match(r"^/opinion/\d{4}/[a-z]+/\d{1,2}/", href))


async def _fetch(client: httpx.AsyncClient, url: str) -> Optional[str]:
    try:
        resp = await client.get(url, headers=HEADERS, timeout=20.0, follow_redirects=True)
        if resp.status_code != 200:
            print(f"  [wtimes] HTTP {resp.status_code} for {url}", file=sys.stderr)
            return None
        return resp.text
    except Exception as e:
        print(f"  [wtimes] fetch error {url}: {e}", file=sys.stderr)
        return None


def _parse_index(html: str) -> list[dict]:
    """인덱스 페이지에서 (url, title) 쌍 추출."""
    soup = BeautifulSoup(html, "html.parser")
    seen: set[str] = set()
    items: list[dict] = []

    # 사설 인덱스는 보통 article 또는 li 카드 안에 a[href*='/opinion/'] 가 있음.
    # 안정성을 위해 모든 a 태그를 훑고 URL 패턴으로 필터.
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not _looks_like_editorial_url(href):
            continue
        # 텍스트가 비어있는 a (이미지 링크 등) 스킵
        title = a.get_text(strip=True)
        if not title or len(title) < 8:
            continue
        full = urljoin(BASE, href)
        if full in seen:
            continue
        seen.add(full)
        items.append({"url": full, "title_original": title})

    return items


def _parse_article(html: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """본문 페이지에서 (title, body, published_at) 추출."""
    soup = BeautifulSoup(html, "html.parser")

    # 제목: 보통 h1.page-title, h1.article-headline, 또는 og:title
    title = None
    for sel in ["h1.page-title", "h1.article-headline", "h1.headline", "h1"]:
        el = soup.select_one(sel)
        if el and el.get_text(strip=True):
            title = el.get_text(strip=True)
            break
    if not title:
        og = soup.find("meta", attrs={"property": "og:title"})
        if og:
            title = og.get("content", "").strip()

    # 발행 시각: <meta property="article:published_time" content="2026-05-22T...">
    published_at = None
    for prop in ["article:published_time", "article:published", "og:published_time"]:
        m = soup.find("meta", attrs={"property": prop})
        if m and m.get("content"):
            published_at = m["content"].strip()
            break
    if not published_at:
        # <time datetime="...">
        t = soup.find("time")
        if t and t.get("datetime"):
            published_at = t["datetime"].strip()

    # 본문: 다양한 selector 시도
    body = None
    candidates = [
        "div.article-content",
        "article .article-content",
        "div.story-body",
        "div.bodytext",
        "div.entry-content",
        "article",
    ]
    for sel in candidates:
        el = soup.select_one(sel)
        if not el:
            continue
        # 광고/관련기사 등 제거
        for junk in el.select("aside, figure, .related, .ad, script, style, .share, .newsletter"):
            junk.decompose()
        text = el.get_text("\n", strip=True)
        # 너무 짧으면 다른 후보 계속 탐색
        if len(text) >= 200:
            body = text[:8000]
            break

    return title, body, published_at


async def collect(limit: int = 10) -> list[ForeignEditorialItem]:
    """Washington Times 사설 인덱스에서 최신 N건 수집."""
    async with httpx.AsyncClient() as client:
        html = await _fetch(client, INDEX_URL)
        if not html:
            print("[wtimes] 인덱스 페이지 가져오기 실패", file=sys.stderr)
            return []

        index = _parse_index(html)
        print(f"[wtimes] 인덱스에서 {len(index)}건 발견")
        if not index:
            return []

        results: list[ForeignEditorialItem] = []
        for entry in index[:limit]:
            article_html = await _fetch(client, entry["url"])
            await asyncio.sleep(0.5)
            if not article_html:
                continue
            title, body, published_at = _parse_article(article_html)
            item: ForeignEditorialItem = {
                "source_code": "wtimes",
                "url": entry["url"],
                "title_original": title or entry["title_original"],
                "body_original": body,
                "author": None,  # 사설은 보통 unsigned
                "published_at": published_at,
            }
            results.append(item)
            print(f"  [wtimes] {item['title_original'][:60]} | body={len(body) if body else 0}자")

        return results


if __name__ == "__main__":
    # 단독 실행 디버그용
    import json

    async def _main():
        rows = await collect(limit=3)
        print(json.dumps(rows, indent=2, ensure_ascii=False))

    asyncio.run(_main())
