"""뉴욕타임스 사설 수집기 (Playwright, 구독 계정).

환경변수: NYT_ID (이메일), NYT_PW (비밀번호)
쿠키 캐시: foreign_session 테이블 (TTL 14일)
"""
from __future__ import annotations

import os
import re
import sys
from typing import Optional

import httpx
from bs4 import BeautifulSoup
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


async def _get_article_httpx(url: str, cookie_header: str) -> Optional[dict]:
    """NYT는 Next.js SSR — httpx로 직접 가져오면 초기 HTML에 본문 포함."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Cookie": cookie_header,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
            resp = await client.get(url, headers=headers)
            print(f"  [nyt] httpx status={resp.status_code} url={url[:60]}")
            if resp.status_code != 200:
                return None
            html = resp.text
    except Exception as e:
        print(f"  [nyt] httpx 오류 {url[:60]}: {e}", file=sys.stderr)
        return None

    pw_hit = any(kw in html.lower() for kw in _PAYWALL_KW)
    print(f"  [nyt] paywall={pw_hit} html_len={len(html)}")
    if pw_hit:
        return None

    soup = BeautifulSoup(html, "html.parser")

    # 제목
    title = None
    og = soup.find("meta", attrs={"property": "og:title"})
    if og:
        title = og.get("content", "").strip()
    if not title:
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text(strip=True)

    # 발행 시각
    pub = None
    for prop in ["article:published_time", "og:article:published_time"]:
        m = soup.find("meta", attrs={"property": prop})
        if m and m.get("content"):
            pub = m["content"].strip()
            break

    # 본문
    body = None
    for sel in ['section[name="articleBody"]', "article"]:
        el = soup.select_one(sel)
        if el:
            paras = [p.get_text(strip=True) for p in el.find_all("p") if len(p.get_text(strip=True)) > 20]
            if len(paras) >= 3:
                body = "\n".join(paras)[:8000]
                break

    return {"title": title, "body": body, "published_at": pub}


async def _get_article(ctx, url: str) -> Optional[dict]:
    # 컨텍스트의 쿠키를 Cookie 헤더로 변환해 httpx로 직접 fetch
    try:
        all_cookies = await ctx.cookies()
        cookie_header = "; ".join(f"{c['name']}={c['value']}" for c in all_cookies)
        return await _get_article_httpx(url, cookie_header)
    except Exception as e:
        print(f"  [nyt] 기사 오류 {url[:60]}: {e}", file=sys.stderr)
        return None


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
