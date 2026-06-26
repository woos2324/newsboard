"""워싱턴포스트 사설 수집기 (curl_cffi, RSS + __NEXT_DATA__).

Playwright는 www.washingtonpost.com HTTP/2 차단으로 불가.
httpx는 Akamai TLS 핑거프린트 감지로 타임아웃 차단.
curl_cffi로 Chrome TLS 핑거프린트 위장 → Akamai 우회.
인덱스: feeds.washingtonpost.com/rss/opinions (Cloudflare 우회)
본문:   washingtonpost.com 기사 페이지 __NEXT_DATA__ JSON
쿠키 캐시: foreign_session 테이블 (TTL 30일, --seed-cookies wapo 로 갱신)
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
import xml.etree.ElementTree as ET
from typing import Optional

import httpx
from curl_cffi import requests as cffi_requests
from email.utils import parsedate_to_datetime

from scripts.lib.foreign_collectors.base import ForeignEditorialItem
from scripts.lib.foreign_collectors.playwright_base import load_cookies

RSS_URL = "https://feeds.washingtonpost.com/rss/opinions"
_PAYWALL_KW = ["subscribe to continue", "sign in to read", "get unlimited access"]
_SKIP_URL_PATTERNS = ["/podcasts/", "/video/", "/live-updates/"]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "en-US,en;q=0.9",
}


def _parse_rss(xml_text: str) -> list[dict]:
    items = []
    seen: set[str] = set()
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        print(f"  [wapo] RSS 파싱 오류: {e}", file=sys.stderr)
        return items
    for item in root.iter("item"):
        url = (item.findtext("link") or "").strip()
        title = (item.findtext("title") or "").strip()
        pub_raw = (item.findtext("pubDate") or "").strip()
        if not url or not title or url in seen:
            continue
        if any(p in url for p in _SKIP_URL_PATTERNS):
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


def _extract_body(html: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """__NEXT_DATA__ JSON에서 (title, published_at, body) 추출."""
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return None, None, None
    try:
        data = json.loads(m.group(1))
    except Exception:
        return None, None, None

    gc = data.get("props", {}).get("pageProps", {}).get("globalContent", {})
    title = (gc.get("headlines", {}).get("basic") or gc.get("display_headline") or "").strip()
    pub = gc.get("publish_date") or gc.get("last_updated_date") or ""

    paragraphs = []
    for el in gc.get("content_elements", []):
        if el.get("type") in ("text", "paragraph"):
            raw = el.get("content", "")
            clean = re.sub(r"<[^>]+>", "", raw).strip()
            if len(clean) > 20:
                paragraphs.append(clean)

    body = "\n".join(paragraphs)[:8000] if paragraphs else None
    return title or None, pub or None, body


async def collect(limit: int = 10, supabase=None) -> list[ForeignEditorialItem]:
    cookies = load_cookies("wapo", supabase) if supabase else None
    if not cookies:
        print("[wapo] 쿠키 없음 — --seed-cookies wapo 로 먼저 쿠키를 심어야 합니다.", file=sys.stderr)

    cookie_header = "; ".join(f"{c['name']}={c['value']}" for c in (cookies or []))

    # RSS 수집 (feeds.washingtonpost.com)
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as rss_client:
            rss_resp = await rss_client.get(RSS_URL, headers=HEADERS)
            if rss_resp.status_code != 200:
                print(f"[wapo] RSS HTTP {rss_resp.status_code}", file=sys.stderr)
                return []
    except Exception as e:
        print(f"[wapo] RSS 오류: {e}", file=sys.stderr)
        return []

    index = _parse_rss(rss_resp.text)
    print(f"  [wapo] RSS {len(index)}건 발견")
    if not index:
        return []

    h = dict(HEADERS)
    if cookie_header:
        h["Cookie"] = cookie_header

    # 기사 수집 — curl_cffi로 Chrome TLS 핑거프린트 위장 (Akamai 우회)
    def _fetch_article(url: str) -> Optional[str]:
        try:
            r = cffi_requests.get(
                url, headers=h, cookies={c["name"]: c["value"] for c in (cookies or [])},
                impersonate="chrome124", timeout=30, allow_redirects=True,
            )
            return r.text if r.status_code == 200 else None
        except Exception as e:
            print(f"  [wapo] fetch 오류 {url[:60]}: {e}", file=sys.stderr)
            return None

    results: list[ForeignEditorialItem] = []
    loop = asyncio.get_event_loop()
    for i, entry in enumerate(index[:limit]):
        if i > 0:
            await asyncio.sleep(5)
        try:
            html = await loop.run_in_executor(None, _fetch_article, entry["url"])
            if html is None:
                continue
            if any(kw in html.lower() for kw in _PAYWALL_KW):
                print(f"  [wapo] 페이월: {entry['url'][:60]}", file=sys.stderr)
                continue

            title, pub, body = _extract_body(html)
            item: ForeignEditorialItem = {
                "source_code": "wapo",
                "url": entry["url"],
                "title_original": title or entry["title_original"],
                "body_original": body,
                "author": None,
                "published_at": pub or entry.get("published_at"),
            }
            results.append(item)
            print(f"  [wapo] {item['title_original'][:60]} | body={len(body) if body else 0}자")
        except Exception as e:
            print(f"  [wapo] 오류 {entry['url'][:60]}: {e}", file=sys.stderr)

    return results
