"""마이니치신문 사설 수집기 (무료, httpx).

인덱스: https://mainichi.jp/editorial/
URL 패턴: https://mainichi.jp/articles/YYYYMMDD/ddm/005/070/...
인덱스 페이지의 JSON-LD ItemList 에서 사설 목록 추출.
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

INDEX_URL = "https://mainichi.jp/editorial/"
ARTICLE_RE = re.compile(r"^https?://mainichi\.jp/articles/\d{8}/")

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
            print(f"  [mainichi] HTTP {resp.status_code} for {url}", file=sys.stderr)
            return None
        return resp.text
    except Exception as e:
        print(f"  [mainichi] fetch error {url}: {e}", file=sys.stderr)
        return None


def _parse_index(html: str) -> list[dict]:
    """인덱스 페이지의 JSON-LD ItemList 에서 (url, title, datePublished) 추출."""
    soup = BeautifulSoup(html, "html.parser")
    items: list[dict] = []
    seen: set[str] = set()

    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            data = json.loads(script.string or "")
        except Exception:
            continue

        # 마이니치는 CollectionPage 안의 hasPart 배열에 NewsArticle 목록을 둠.
        # 다른 패턴(ItemList, @graph) 도 함께 지원.
        candidates = []
        if isinstance(data, dict):
            t = data.get("@type")
            if t == "ItemList":
                for el in data.get("itemListElement", []):
                    candidates.append(el.get("item") if isinstance(el, dict) else el)
            elif "hasPart" in data:
                candidates.extend(data["hasPart"])
            elif "@graph" in data:
                candidates.extend(data["@graph"])
            else:
                candidates.append(data)
        elif isinstance(data, list):
            candidates.extend(data)

        for c in candidates:
            if not isinstance(c, dict):
                continue
            url = c.get("url") or c.get("@id")
            headline = c.get("headline") or c.get("name")
            published = c.get("datePublished")
            if not url or not headline:
                continue
            if not ARTICLE_RE.match(url):
                continue
            if url in seen:
                continue
            seen.add(url)
            items.append({
                "url": url,
                "title_original": headline,
                "published_at": published,
            })

    return items


def _parse_article(html: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """본문 페이지에서 (title, body, published_at) 추출."""
    soup = BeautifulSoup(html, "html.parser")

    # 제목
    title = None
    h1 = soup.select_one("h1.title-page, h1.articledetail-title, h1.title, h1")
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

    # 본문: .articledetail-body 안의 <p> 단락만 join (페이지 헤더/공유 메뉴/광고 제외)
    body = None
    paragraphs = [
        p.get_text(strip=True)
        for p in soup.select(".articledetail-body p")
        if p.get_text(strip=True)
    ]
    if paragraphs:
        body = "\n".join(paragraphs)[:8000]
    else:
        # 폴백: 단락 마크업 없는 경우 컨테이너 전체에서 잡되 광고/캡션은 제거
        el = soup.select_one(".articledetail-body, article")
        if el:
            for junk in el.select("aside, figure, .ad, .related, script, style, .share, .featureheadline"):
                junk.decompose()
            text = el.get_text("\n", strip=True)
            if len(text) >= 100:
                body = text[:8000]

    return title, body, published_at


async def collect(limit: int = 10) -> list[ForeignEditorialItem]:
    async with httpx.AsyncClient() as client:
        html = await _fetch(client, INDEX_URL)
        if not html:
            return []

        index = _parse_index(html)
        print(f"[mainichi] 인덱스에서 {len(index)}건 발견")
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
                "source_code": "mainichi",
                "url": entry["url"],
                "title_original": title or entry["title_original"],
                "body_original": body,
                "author": None,
                "published_at": published_at or entry.get("published_at"),
            }
            results.append(item)
            print(f"  [mainichi] {item['title_original'][:60]} | body={len(body) if body else 0}자")

        return results


if __name__ == "__main__":
    async def _main():
        rows = await collect(limit=3)
        for r in rows:
            print(json.dumps(r, ensure_ascii=False, indent=2))
    asyncio.run(_main())
