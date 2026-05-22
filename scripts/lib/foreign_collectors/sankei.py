"""산케이신문 사설 수집기 (무료 영역, httpx).

인덱스: https://www.sankei.com/column/editorial/
사설 표제: ＜主張＞... 형식
URL 패턴: /article/YYYYMMDD-<HASH>/
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
from typing import Optional
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from scripts.lib.foreign_collectors.base import ForeignEditorialItem

INDEX_URL = "https://www.sankei.com/column/editorial/"
BASE = "https://www.sankei.com"
ARTICLE_RE = re.compile(r"/article/\d{8}-[A-Z0-9]+/?")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
}


async def _fetch(client: httpx.AsyncClient, url: str) -> Optional[str]:
    try:
        resp = await client.get(url, headers=HEADERS, timeout=20.0, follow_redirects=True)
        if resp.status_code != 200:
            print(f"  [sankei] HTTP {resp.status_code} for {url}", file=sys.stderr)
            return None
        return resp.text
    except Exception as e:
        print(f"  [sankei] fetch error {url}: {e}", file=sys.stderr)
        return None


def _parse_index(html: str) -> list[dict]:
    """h3 에 ＜主張＞ 가 있는 카드만 추출. 같은 컨테이너의 /article/... 링크와 매칭."""
    soup = BeautifulSoup(html, "html.parser")
    seen: set[str] = set()
    items: list[dict] = []

    for h3 in soup.find_all("h3"):
        title = h3.get_text(strip=True)
        if "主張" not in title:
            continue

        # 부모를 거슬러 올라가면서 article URL 가진 a 탐색
        article_url: Optional[str] = None
        parent = h3.parent
        for _ in range(6):
            if parent is None:
                break
            a = parent.find("a", href=ARTICLE_RE)
            if a:
                article_url = a["href"]
                break
            parent = parent.parent

        if not article_url:
            continue
        full = urljoin(BASE, article_url).rstrip("/") + "/"
        if full in seen:
            continue
        seen.add(full)
        items.append({"url": full, "title_original": title})

    return items


def _parse_article(html: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    soup = BeautifulSoup(html, "html.parser")

    # 제목
    title = None
    h1 = soup.select_one("h1.article-title, h1.entry-title, h1")
    if h1:
        title = h1.get_text(strip=True)
    if not title:
        og = soup.find("meta", attrs={"property": "og:title"})
        if og:
            title = og.get("content", "").strip()

    # 발행 시각
    published_at = None
    for prop in ["article:published_time", "og:published_time"]:
        m = soup.find("meta", attrs={"property": prop})
        if m and m.get("content"):
            published_at = m["content"].strip()
            break
    if not published_at:
        t = soup.find("time")
        if t and t.get("datetime"):
            published_at = t["datetime"].strip()

    # 본문
    body = None
    for sel in ["div.article-body", "div.entry-content", "section.article-body", "article"]:
        el = soup.select_one(sel)
        if not el:
            continue
        for junk in el.select("aside, figure, .ad, .related, script, style, .share, .paywall"):
            junk.decompose()
        text = el.get_text("\n", strip=True)
        if len(text) >= 100:
            body = text[:8000]
            break

    return title, body, published_at


async def collect(limit: int = 10) -> list[ForeignEditorialItem]:
    async with httpx.AsyncClient() as client:
        html = await _fetch(client, INDEX_URL)
        if not html:
            return []

        index = _parse_index(html)
        print(f"[sankei] 인덱스에서 {len(index)}건 발견")
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
                "source_code": "sankei",
                "url": entry["url"],
                "title_original": title or entry["title_original"],
                "body_original": body,
                "author": None,
                "published_at": published_at,
            }
            results.append(item)
            print(f"  [sankei] {item['title_original'][:60]} | body={len(body) if body else 0}자")

        return results


if __name__ == "__main__":
    async def _main():
        rows = await collect(limit=3)
        for r in rows:
            print(json.dumps(r, ensure_ascii=False, indent=2))
    asyncio.run(_main())
