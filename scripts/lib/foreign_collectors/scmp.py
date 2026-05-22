"""사우스차이나모닝포스트 사설 수집기 (Playwright, 구독 계정).

환경변수: SCMP_ID (이메일), SCMP_PW (비밀번호)
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

INDEX_URL = "https://www.scmp.com/opinion/sc-mp-editorials"
LOGIN_URL = "https://www.scmp.com/"  # 메인 페이지에서 로그인 버튼 클릭
_ARTICLE_RE = re.compile(r"scmp\.com/(?:opinion|comment)/")
_PAYWALL_KW = ["subscribe to scmp", "subscribe to read", "become a subscriber"]


async def _login(ctx, email: str, password: str) -> bool:
    page = await new_stealth_page(ctx)
    try:
        print(f"  [scmp] 로그인 시도 ({email})")
        await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=40_000)
        await page.wait_for_timeout(2_000)

        # 메인 페이지의 로그인 버튼 클릭
        login_btn_sel = 'a[href*="login"], button:has-text("Log in"), a:has-text("Log in"), [data-qa*="login"]'
        try:
            await page.wait_for_selector(login_btn_sel, timeout=8_000)
            await page.click(login_btn_sel)
            await page.wait_for_load_state("networkidle", timeout=15_000)
        except Exception:
            pass  # 버튼 없으면 현재 URL로 계속
        print(f"  [scmp] 로그인 페이지: {await page.title()} | {page.url[:60]}")

        email_sel = 'input[name="email"], input[type="email"]'
        await page.wait_for_selector(email_sel, timeout=15_000)
        await page.fill(email_sel, email)

        pw_visible = await page.is_visible('input[type="password"]', timeout=2_000)
        if not pw_visible:
            await page.click('button[type="submit"]')
            await page.wait_for_load_state("networkidle", timeout=15_000)

        await page.wait_for_selector('input[type="password"]', timeout=10_000)
        await page.fill('input[type="password"]', password)
        await page.click('button[type="submit"]')
        await page.wait_for_load_state("networkidle", timeout=20_000)

        url = page.url
        ok = "login" not in url.lower()
        print(f"  [scmp] 로그인 {'성공' if ok else '실패'} → {url[:80]}")
        return ok
    except Exception as e:
        print(f"  [scmp] 로그인 오류: {e}", file=sys.stderr)
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
            # 인덱스 페이지 자체 URL 제외
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
    email = os.environ.get("SCMP_ID", "")
    password = os.environ.get("SCMP_PW", "")
    if not email or not password:
        print("[scmp] SCMP_ID / SCMP_PW 환경변수 없음, 건너뜀", file=sys.stderr)
        return []

    cookies = load_cookies("scmp", supabase) if supabase else None

    async with async_playwright() as pw:
        ctx = await make_context(pw, cookies)

        if not cookies:
            ok = await _login(ctx, email, password)
            if not ok:
                await ctx.browser.close()
                return []
            new_cookies = await ctx.cookies()
            if supabase:
                save_cookies("scmp", new_cookies, supabase)

        index = await _get_index(ctx)
        results: list[ForeignEditorialItem] = []

        for entry in index[:limit]:
            art = await _get_article(ctx, entry["url"])

            if art is None and cookies:
                print("  [scmp] 페이월 감지, 재로그인")
                ok = await _login(ctx, email, password)
                if ok:
                    new_cookies = await ctx.cookies()
                    if supabase:
                        save_cookies("scmp", new_cookies, supabase)
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
