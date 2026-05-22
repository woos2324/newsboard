"""The Guardian 사설 수집기 (영어, 무료, RSS 기반).

가디언은 페이월 없음 (자발적 기부 모델). 인덱스 페이지는 client-side 렌더링이라
사설 카드가 정적 HTML에 없음 → RSS 피드 사용.

RSS: https://www.theguardian.com/tone/editorials/rss
각 item 의 description 에 본문 HTML(p 태그) 포함 — 본문 페이지 별도 fetch 없이 가능.
"""
from __future__ import annotations

import asyncio
import re
import sys
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from scripts.lib.foreign_collectors.base import ForeignEditorialItem

RSS_URL = "https://www.theguardian.com/tone/editorials/rss"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
    "Accept-Language": "en-GB,en;q=0.9",
}


async def _fetch(client: httpx.AsyncClient, url: str) -> Optional[str]:
    try:
        resp = await client.get(url, headers=HEADERS, timeout=20.0, follow_redirects=True)
        if resp.status_code != 200:
            print(f"  [guardian] HTTP {resp.status_code} for {url}", file=sys.stderr)
            return None
        return resp.text
    except Exception as e:
        print(f"  [guardian] fetch error {url}: {e}", file=sys.stderr)
        return None


def _rss_to_iso(pub_date: str) -> Optional[str]:
    """RFC 822 (Thu, 21 May 2026 17:29:17 GMT) → ISO8601."""
    try:
        dt = parsedate_to_datetime(pub_date)
        return dt.isoformat()
    except Exception:
        return None


def _clean_title(title: str) -> str:
    # 가디언 사설 제목 끝의 ' | Editorial' 또는 ' - Editorial' 접미사 제거
    return re.sub(r"\s*[\|–-]\s*Editorial\s*$", "", title).strip()


def _description_to_text(html: str) -> str:
    """description HTML(p, a 등) → 평문. 단락 사이 줄바꿈 유지."""
    soup = BeautifulSoup(html, "html.parser")
    paragraphs = [p.get_text(strip=True) for p in soup.find_all("p") if p.get_text(strip=True)]
    if paragraphs:
        return "\n".join(paragraphs)
    return soup.get_text(strip=True)


def _parse_rss(xml_text: str) -> list[dict]:
    """RSS XML → [{url, title_original, body_original, published_at}]"""
    items: list[dict] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        print(f"  [guardian] RSS parse error: {e}", file=sys.stderr)
        return items

    channel = root.find("channel")
    if channel is None:
        return items

    for item in channel.findall("item"):
        title_el = item.find("title")
        link_el = item.find("link")
        desc_el = item.find("description")
        pub_el = item.find("pubDate")
        if title_el is None or link_el is None:
            continue

        title = _clean_title(title_el.text or "")
        link = (link_el.text or "").strip()
        desc_html = desc_el.text or "" if desc_el is not None else ""
        pub = (pub_el.text or "") if pub_el is not None else ""
        if not title or not link:
            continue

        items.append({
            "url": link,
            "title_original": title,
            "body_original": _description_to_text(desc_html) if desc_html else None,
            "published_at": _rss_to_iso(pub) if pub else None,
        })
    return items


async def collect(limit: int = 10) -> list[ForeignEditorialItem]:
    async with httpx.AsyncClient() as client:
        xml_text = await _fetch(client, RSS_URL)
        if not xml_text:
            return []

        parsed = _parse_rss(xml_text)
        print(f"[guardian] RSS에서 {len(parsed)}건 발견")
        if not parsed:
            return []

        results: list[ForeignEditorialItem] = []
        for entry in parsed[:limit]:
            item: ForeignEditorialItem = {
                "source_code": "guardian",
                "url": entry["url"],
                "title_original": entry["title_original"],
                "body_original": entry.get("body_original"),
                "author": None,  # 사설은 unsigned (Editorial Board)
                "published_at": entry.get("published_at"),
            }
            results.append(item)
            print(f"  [guardian] {item['title_original'][:60]} | body={len(item.get('body_original') or '')}자")

        return results


if __name__ == "__main__":
    import json

    async def _main():
        rows = await collect(limit=3)
        for r in rows:
            print(json.dumps(r, ensure_ascii=False, indent=2))

    asyncio.run(_main())
