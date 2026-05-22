"""뉴욕타임스 사설 수집기 (Playwright, 구독 계정).

환경변수: NYT_ID (이메일), NYT_PW (비밀번호)
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

INDEX_URL = "https://www.nytimes.com/section/opinion/editorials"
LOGIN_URL = "https://myaccount.nytimes.com/auth/login"
_ARTICLE_RE = re.compile(r"nytimes\.com/\d{4}/\d{2}/\d{2}/opinion/")
_PAYWALL_KW = ["create a free account", "log in or create", "get full access"]


async def _login(ctx, email: str, password: str) -> bool:
    page = await new_stealth_page(ctx)
    try:
        print(f"  [nyt] 로그인 시도 ({email})")
        await page.goto(LOGIN_URL, wait_until="networkidle", timeout=40_000)
        await page.wait_for_timeout(3_000)  # React SPA 렌더링 대기
        print(f"  [nyt] 로그인 페이지: {await page.title()} | {page.url[:60]}")

        email_sel = (
            '[data-testid="login-lede-email-input"], '
            'input[name="email"], input[type="email"]'
        )
        # 메인 프레임 및 하위 프레임 모두 탐색
        found_frame = None
        for frame in [page] + page.frames:
            try:
                await frame.wait_for_selector(email_sel, timeout=5_000)
                found_frame = frame
                break
            except Exception:
                continue
        if found_frame is None:
            raise Exception("email 입력 필드를 찾지 못함 (메인 + 모든 프레임 탐색)")
        await found_frame.fill(email_sel, email)
        page_or_frame = found_frame
        await page.fill(email_sel, email)

        pw_visible = await page_or_frame.is_visible('input[type="password"]', timeout=2_000)
        if not pw_visible:
            submit_sel = '[data-testid="login-submit-button"], button[type="submit"]'
            await page_or_frame.click(submit_sel)
            await page.wait_for_load_state("networkidle", timeout=15_000)
            await page.wait_for_timeout(2_000)

        pw_sel = '[data-testid="login-lede-password-input"], input[type="password"]'
        await page_or_frame.wait_for_selector(pw_sel, timeout=10_000)
        await page_or_frame.fill(pw_sel, password)

        submit_sel = '[data-testid="login-submit-button"], button[type="submit"]'
        await page_or_frame.click(submit_sel)
        await page.wait_for_load_state("networkidle", timeout=20_000)

        url = page.url
        ok = "myaccount.nytimes.com/auth" not in url
        print(f"  [nyt] 로그인 {'성공' if ok else '실패'} → {url[:80]}")
        return ok
    except Exception as e:
        print(f"  [nyt] 로그인 오류: {e}", file=sys.stderr)
        return False
    finally:
        await page.close()


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
            text = lnk.get("text", "").strip()
            if not _ARTICLE_RE.search(href):
                continue
            if not text or len(text) < 8:
                continue
            if href in seen:
                continue
            seen.add(href)
            items.append({"url": href, "title_original": text})
        print(f"  [nyt] 인덱스 {len(items)}건")
        return items
    except Exception as e:
        print(f"  [nyt] 인덱스 오류: {e}", file=sys.stderr)
        return []
    finally:
        await page.close()


async def _get_article(ctx, url: str) -> Optional[dict]:
    page = await new_stealth_page(ctx)
    try:
        await page.goto(url, wait_until="networkidle", timeout=40_000)

        # 기사 URL로 유지됐는지 확인 (홈으로 리다이렉트 감지)
        if not _ARTICLE_RE.search(page.url):
            print(f"  [nyt] 리다이렉트 감지 → {page.url[:60]}", file=sys.stderr)
            return None

        html = await page.content()
        if any(kw in html.lower() for kw in _PAYWALL_KW):
            return None

        # h1 렌더링 대기
        try:
            await page.wait_for_selector("h1", timeout=8_000)
        except Exception:
            pass

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
            'section[name="articleBody"] p',
            '[class*="StoryBodyCompanionColumn"] p',
            "article p",
        ])

        return {"title": title, "body": body, "published_at": pub}
    except Exception as e:
        print(f"  [nyt] 기사 오류 {url[:60]}: {e}", file=sys.stderr)
        return None
    finally:
        await page.close()


async def collect(limit: int = 10, supabase=None) -> list[ForeignEditorialItem]:
    email = os.environ.get("NYT_ID", "")
    password = os.environ.get("NYT_PW", "")
    if not email or not password:
        print("[nyt] NYT_ID / NYT_PW 환경변수 없음, 건너뜀", file=sys.stderr)
        return []

    cookies = load_cookies("nyt", supabase) if supabase else None

    async with async_playwright() as pw:
        ctx = await make_context(pw, cookies)

        if not cookies:
            ok = await _login(ctx, email, password)
            if not ok:
                await ctx.browser.close()
                return []
            new_cookies = await ctx.cookies()
            if supabase:
                save_cookies("nyt", new_cookies, supabase)

        index = await _get_index(ctx)
        results: list[ForeignEditorialItem] = []

        for entry in index[:limit]:
            art = await _get_article(ctx, entry["url"])

            if art is None and cookies:
                print("  [nyt] 페이월 감지, 재로그인")
                ok = await _login(ctx, email, password)
                if ok:
                    new_cookies = await ctx.cookies()
                    if supabase:
                        save_cookies("nyt", new_cookies, supabase)
                    art = await _get_article(ctx, entry["url"])

            if art is None:
                print(f"  [nyt] 스킵: {entry['url'][:60]}", file=sys.stderr)
                continue

            item: ForeignEditorialItem = {
                "source_code": "nyt",
                "url": entry["url"],
                "title_original": art["title"] or entry["title_original"],
                "body_original": art["body"],
                "author": None,
                "published_at": art["published_at"],
            }
            results.append(item)
            print(f"  [nyt] {item['title_original'][:60]} | body={len(item['body_original'] or '')}자")

        await ctx.browser.close()

    return results
