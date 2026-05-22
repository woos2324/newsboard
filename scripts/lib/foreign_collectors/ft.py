"""파이낸셜타임스 사설 수집기 (Playwright, 구독 계정).

환경변수: FT_ID (이메일), FT_PW (비밀번호)
쿠키 캐시: foreign_session 테이블 (TTL 14일)
"""
from __future__ import annotations

import os
import re
import sys
from typing import Optional

from playwright.async_api import async_playwright

from scripts.lib.foreign_collectors.base import ForeignEditorialItem
from scripts.lib.foreign_collectors.playwright_base import (
    extract_body, load_cookies, make_context, new_stealth_page, save_cookies,
)

INDEX_URL = "https://www.ft.com/opinion/the-ft-view"
LOGIN_URL = "https://accounts.ft.com/login"
_ARTICLE_RE = re.compile(r"ft\.com/content/[0-9a-f-]{30,}")
_PAYWALL_KW = ["subscribe to read", "try the financial times", "become an ft subscriber"]


async def _login(ctx, email: str, password: str) -> bool:
    page = await new_stealth_page(ctx)
    try:
        print(f"  [ft] 로그인 시도 ({email})")
        await page.goto(LOGIN_URL, wait_until="networkidle", timeout=40_000)
        print(f"  [ft] 로그인 페이지: {await page.title()} | {page.url[:60]}")

        email_sel = 'input[id="email"], input[name="email"], input[type="email"]'
        await page.wait_for_selector(email_sel, timeout=15_000)
        await page.fill(email_sel, email)

        # FT는 이메일+비밀번호가 같은 폼이거나 2단계일 수 있음
        pw_visible = await page.is_visible('input[type="password"]', timeout=2_000)
        _btn_sel = 'button[type="submit"], input[type="submit"], button.o-buttons--primary, button:has-text("Sign"), button:has-text("Continue")'
        if not pw_visible:
            await page.click(_btn_sel)
            await page.wait_for_load_state("networkidle", timeout=15_000)

        await page.wait_for_selector('input[type="password"]', timeout=10_000)
        await page.fill('input[type="password"]', password)
        await page.click(_btn_sel)
        await page.wait_for_load_state("networkidle", timeout=20_000)

        url = page.url
        ok = "accounts.ft.com" not in url
        print(f"  [ft] 로그인 {'성공' if ok else '실패'} → {url[:80]}")
        return ok
    except Exception as e:
        print(f"  [ft] 로그인 오류: {e}", file=sys.stderr)
        return False
    finally:
        await page.close()


async def _get_index(ctx) -> list[dict]:
    page = await new_stealth_page(ctx)
    try:
        await page.goto(INDEX_URL, wait_until="networkidle", timeout=30_000)
        await page.wait_for_timeout(2_000)
        links = await page.eval_on_selector_all(
            "a[href]",
            "els => els.map(e => ({href: e.href, text: e.innerText.trim()}))",
        )
        seen: set[str] = set()
        items = []
        for lnk in links:
            href = lnk.get("href", "")
            text = lnk.get("text", "").strip()
            if not _ARTICLE_RE.search(href):
                continue
            if not text or len(text) < 8:
                continue
            if href in seen:
                continue
            seen.add(href)
            items.append({"url": href, "title_original": text})
        print(f"  [ft] 인덱스 {len(items)}건")
        return items
    except Exception as e:
        print(f"  [ft] 인덱스 오류: {e}", file=sys.stderr)
        return []
    finally:
        await page.close()


async def _get_article(ctx, url: str) -> Optional[dict]:
    page = await new_stealth_page(ctx)
    try:
        await page.goto(url, wait_until="networkidle", timeout=30_000)
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
        if not pub:
            # FT는 time 태그 사용
            t = page.locator("time[dateTime]").first
            if await t.count():
                pub = await t.get_attribute("dateTime")

        body = await extract_body(page, [
            ".n-content-body p",
            '[class*="article__content"] p',
            "article p",
        ])

        return {"title": title, "body": body, "published_at": pub}
    except Exception as e:
        print(f"  [ft] 기사 오류 {url[:60]}: {e}", file=sys.stderr)
        return None
    finally:
        await page.close()


async def collect(limit: int = 10, supabase=None) -> list[ForeignEditorialItem]:
    email = os.environ.get("FT_ID", "")
    password = os.environ.get("FT_PW", "")
    if not email or not password:
        print("[ft] FT_ID / FT_PW 환경변수 없음, 건너뜀", file=sys.stderr)
        return []

    cookies = load_cookies("ft", supabase) if supabase else None

    async with async_playwright() as pw:
        ctx = await make_context(pw, cookies)

        if not cookies:
            ok = await _login(ctx, email, password)
            if not ok:
                await ctx.browser.close()
                return []
            new_cookies = await ctx.cookies()
            if supabase:
                save_cookies("ft", new_cookies, supabase)

        index = await _get_index(ctx)
        results: list[ForeignEditorialItem] = []

        for entry in index[:limit]:
            art = await _get_article(ctx, entry["url"])

            if art is None and cookies:
                print("  [ft] 페이월 감지, 재로그인")
                ok = await _login(ctx, email, password)
                if ok:
                    new_cookies = await ctx.cookies()
                    if supabase:
                        save_cookies("ft", new_cookies, supabase)
                    art = await _get_article(ctx, entry["url"])

            if art is None:
                print(f"  [ft] 스킵: {entry['url'][:60]}", file=sys.stderr)
                continue

            item: ForeignEditorialItem = {
                "source_code": "ft",
                "url": entry["url"],
                "title_original": art["title"] or entry["title_original"],
                "body_original": art["body"],
                "author": None,
                "published_at": art["published_at"],
            }
            results.append(item)
            print(f"  [ft] {item['title_original'][:60]} | body={len(item['body_original'] or '')}자")

        await ctx.browser.close()

    return results
