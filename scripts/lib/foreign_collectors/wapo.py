"""워싱턴포스트 사설 수집기 (Playwright, 구독 계정).

환경변수: WAPO_ID (이메일), WAPO_PW (비밀번호)
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
    extract_body, load_cookies, make_context, save_cookies,
)

INDEX_URL = "https://www.washingtonpost.com/opinions/editorials/"
LOGIN_URL = "https://account.washingtonpost.com/login"
_ARTICLE_RE = re.compile(r"washingtonpost\.com/opinions/\d{4}/\d{2}/\d{2}/")
_PAYWALL_KW = ["subscribe to continue", "sign in to read", "get unlimited access"]


async def _login(ctx, email: str, password: str) -> bool:
    page = await ctx.new_page()
    try:
        print(f"  [wapo] 로그인 시도 ({email})")
        await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=30_000)
        await page.wait_for_timeout(2_000)

        # Email 입력 — WaPo는 name="username" 사용
        email_sel = 'input[name="username"], input[name="email"], input[type="email"]'
        await page.fill(email_sel, email)

        # 비밀번호 필드가 이미 보이면 단일 폼, 없으면 이메일 먼저 제출
        pw_visible = await page.is_visible('input[type="password"]', timeout=2_000)
        if not pw_visible:
            await page.click('button[type="submit"]')
            await page.wait_for_timeout(2_000)

        await page.fill('input[type="password"]', password)
        await page.click('button[type="submit"]')
        await page.wait_for_load_state("networkidle", timeout=20_000)

        url = page.url
        ok = "login" not in url.lower() and "account.washington" not in url.lower()
        print(f"  [wapo] 로그인 {'성공' if ok else '실패'} → {url[:80]}")
        return ok
    except Exception as e:
        print(f"  [wapo] 로그인 오류: {e}", file=sys.stderr)
        return False
    finally:
        await page.close()


async def _get_index(ctx) -> list[dict]:
    page = await ctx.new_page()
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
        print(f"  [wapo] 인덱스 {len(items)}건")
        return items
    except Exception as e:
        print(f"  [wapo] 인덱스 오류: {e}", file=sys.stderr)
        return []
    finally:
        await page.close()


async def _get_article(ctx, url: str) -> Optional[dict]:
    page = await ctx.new_page()
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        await page.wait_for_timeout(1_500)

        html = await page.content()
        if any(kw in html.lower() for kw in _PAYWALL_KW):
            return None  # paywall

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
            '[data-component="paragraph"]',
            ".article-body p",
            "article p",
        ])

        return {"title": title, "body": body, "published_at": pub}
    except Exception as e:
        print(f"  [wapo] 기사 오류 {url[:60]}: {e}", file=sys.stderr)
        return None
    finally:
        await page.close()


async def collect(limit: int = 10, supabase=None) -> list[ForeignEditorialItem]:
    email = os.environ.get("WAPO_ID", "")
    password = os.environ.get("WAPO_PW", "")
    if not email or not password:
        print("[wapo] WAPO_ID / WAPO_PW 환경변수 없음, 건너뜀", file=sys.stderr)
        return []

    cookies = load_cookies("wapo", supabase) if supabase else None

    async with async_playwright() as pw:
        ctx = await make_context(pw, cookies)

        if not cookies:
            ok = await _login(ctx, email, password)
            if not ok:
                await ctx.browser.close()
                return []
            new_cookies = await ctx.cookies()
            if supabase:
                save_cookies("wapo", new_cookies, supabase)

        index = await _get_index(ctx)
        results: list[ForeignEditorialItem] = []

        for entry in index[:limit]:
            art = await _get_article(ctx, entry["url"])

            if art is None and cookies:
                # 캐시 쿠키로 페이월 → 재로그인 1회
                print("  [wapo] 페이월 감지, 재로그인")
                ok = await _login(ctx, email, password)
                if ok:
                    new_cookies = await ctx.cookies()
                    if supabase:
                        save_cookies("wapo", new_cookies, supabase)
                    art = await _get_article(ctx, entry["url"])

            if art is None:
                print(f"  [wapo] 스킵: {entry['url'][:60]}", file=sys.stderr)
                continue

            item: ForeignEditorialItem = {
                "source_code": "wapo",
                "url": entry["url"],
                "title_original": art["title"] or entry["title_original"],
                "body_original": art["body"],
                "author": None,
                "published_at": art["published_at"],
            }
            results.append(item)
            print(f"  [wapo] {item['title_original'][:60]} | body={len(item['body_original'] or '')}자")

        await ctx.browser.close()

    return results
