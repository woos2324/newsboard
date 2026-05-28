"""사우스차이나모닝포스트 사설 수집기 (Playwright, 로그인 불필요).

에디토리얼 인덱스: https://www.scmp.com/author/scmp-editorial
기사 본문 무료 접근 가능 (구독 불필요).
"""
from __future__ import annotations

import re
import sys
from typing import Optional

from playwright.async_api import async_playwright

from scripts.lib.foreign_collectors.base import ForeignEditorialItem
from scripts.lib.foreign_collectors.playwright_base import (
    extract_body, make_context, new_stealth_page,
)

INDEX_URL = "https://www.scmp.com/author/scmp-editorial"
_ARTICLE_RE = re.compile(r"scmp\.com/(?:opinion|comment)/")
_PAYWALL_KW = ["subscribe to scmp", "subscribe to read", "become a subscriber"]
_TITLE_PREFIX = re.compile(r"^Editorial\s*\|\s*", re.IGNORECASE)


async def _get_index(ctx) -> list[dict]:
    page = await new_stealth_page(ctx)
    try:
        await page.goto(INDEX_URL, wait_until="domcontentloaded", timeout=30_000)
        await page.wait_for_timeout(2_000)
        links = await page.eval_on_selector_all(
            "a[href]",
            "els => els.map(e => ({href: e.href, text: e.innerText.trim()}))",
        )
        seen: set[str] = set()
        items = []
        for lnk in links:
            href = lnk.get("href", "")
            text = _TITLE_PREFIX.sub("", lnk.get("text", "").strip())
            if not _ARTICLE_RE.search(href):
                continue
            if href.rstrip("/") == INDEX_URL.rstrip("/"):
                continue
            if not text or len(text) < 8:
                continue
            if href in seen:
                continue
            seen.add(href)
            items.append({"url": href, "title_original": text})
        print(f"  [scmp] 인덱스 {len(items)}건")
        return items
    except Exception as e:
        print(f"  [scmp] 인덱스 오류: {e}", file=sys.stderr)
        return []
    finally:
        await page.close()


async def _get_article(ctx, url: str) -> Optional[dict]:
    page = await new_stealth_page(ctx)
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        await page.wait_for_timeout(1_500)

        html = await page.content()
        if any(kw in html.lower() for kw in _PAYWALL_KW):
            return None

        title = await page.title()
        h1 = page.locator("h1").first
        if await h1.count():
            t = (await h1.inner_text()).strip()
            if t:
                title = t

        pub = None
        for prop in ["article:published_time", "og:article:published_time"]:
            m = page.locator(f'meta[property="{prop}"]')
            if await m.count():
                pub = await m.get_attribute("content")
                break

        body = await extract_body(page, [
            '[class*="article-body"] p',
            '[class*="body__"] p',
            "article p",
        ])

        return {"title": title, "body": body, "published_at": pub}
    except Exception as e:
        print(f"  [scmp] 기사 오류 {url[:60]}: {e}", file=sys.stderr)
        return None
    finally:
        await page.close()


async def collect(limit: int = 10, supabase=None) -> list[ForeignEditorialItem]:
    async with async_playwright() as pw:
        ctx = await make_context(pw, None)

        index = await _get_index(ctx)
        results: list[ForeignEditorialItem] = []

        for entry in index[:limit]:
            art = await _get_article(ctx, entry["url"])

            if art is None:
                print(f"  [scmp] 스킵: {entry['url'][:60]}", file=sys.stderr)
                continue

            item: ForeignEditorialItem = {
                "source_code": "scmp",
                "url": entry["url"],
                "title_original": art["title"] or entry["title_original"],
                "body_original": art["body"],
                "author": None,
                "published_at": art["published_at"],
            }
            results.append(item)
            print(f"  [scmp] {item['title_original'][:60]} | body={len(item['body_original'] or '')}자")

        await ctx.browser.close()

    return results
