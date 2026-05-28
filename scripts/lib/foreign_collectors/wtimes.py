"""Washington Times 사설 수집기 (httpx, RSS 기반 — Cloudflare 우회).

RSS: https://www.washingtontimes.com/rss/headlines/opinion/editorials/
Cloudflare가 RSS 엔드포인트는 차단하지 않으므로 httpx로 직접 수집.
"""
from __future__ import annotations

import asyncio
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from scripts.lib.foreign_collectors.base import ForeignEditorialItem

RSS_URL = "https://www.washingtontimes.com/rss/headlines/opinion/editorials/"
BASE = "https://www.washingtontimes.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
    "Accept-Language": "en-US,en;q=0.9",
}


def _parse_rss(xml_text: str) -> list[dict]:
    """RSS/Atom XML에서 (url, title, published_at) 추출."""
    items = []
    seen: set[str] = set()
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        print(f"  [wtimes] RSS 파싱 오류: {e}", file=sys.stderr)
        return items

    ns = {"atom": "http://www.w3.org/2005/Atom"}

    for item in root.iter("item"):
        link_el = item.find("link")
        title_el = item.find("title")
        pub_el = item.find("pubDate")

        url = (link_el.text or "").strip() if link_el is not None else ""
        title = (title_el.text or "").strip() if title_el is not None else ""
        pub_raw = (pub_el.text or "").strip() if pub_el is not None else ""

        if not url or not title or url in seen:
            continue
        seen.add(url)

        published_at = None
        if pub_raw:
            try:
                published_at = parsedate_to_datetime(pub_raw).isoformat()
            except Exception:
                pass

        items.append({"url": url, "title_original": title, "published_at": published_at})

    return items


def _parse_article(html: str) -> Optional[str]:
    """본문 페이지에서 기사 body 추출."""
    soup = BeautifulSoup(html, "html.parser")
    for sel in ["div.bigtext", "div.article-text", "div.article-content", "div.story-body", "div.bodytext", "div.entry-content", "article"]:
        el = soup.select_one(sel)
        if not el:
            continue
        for junk in el.select("aside, figure, .related, .ad, script, style, .share, .newsletter"):
            junk.decompose()
        text = el.get_text("\n", strip=True)
        if len(text) >= 200:
            return text[:8000]
    return None


async def collect(limit: int = 10, supabase=None) -> list[ForeignEditorialItem]:
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(RSS_URL, headers=HEADERS, timeout=20.0, follow_redirects=True)
            if resp.status_code != 200:
                print(f"[wtimes] RSS HTTP {resp.status_code}", file=sys.stderr)
                return []
        except Exception as e:
            print(f"[wtimes] RSS 요청 오류: {e}", file=sys.stderr)
            return []

        index = _parse_rss(resp.text)
        print(f"[wtimes] RSS {len(index)}건 발견")
        if not index:
            return []

        results: list[ForeignEditorialItem] = []
        for entry in index[:limit]:
            try:
                art_resp = await client.get(entry["url"], headers=HEADERS, timeout=20.0, follow_redirects=True)
                body = _parse_article(art_resp.text) if art_resp.status_code == 200 else None
            except Exception as e:
                print(f"  [wtimes] 기사 오류 {entry['url'][:60]}: {e}", file=sys.stderr)
                body = None

            await asyncio.sleep(0.5)
            item: ForeignEditorialItem = {
                "source_code": "wtimes",
                "url": entry["url"],
                "title_original": entry["title_original"],
                "body_original": body,
                "author": None,
                "published_at": entry.get("published_at"),
            }
            results.append(item)
            print(f"  [wtimes] {item['title_original'][:60]} | body={len(body) if body else 0}자")

        return results
