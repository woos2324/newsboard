"""Playwright 공통 유틸: 쿠키 DB 관리 + 브라우저 컨텍스트 + 본문 추출."""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional

from playwright.async_api import BrowserContext, Page
from playwright_stealth import stealth_async

COOKIE_TTL_DAYS = 14

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def load_cookies(source_code: str, supabase) -> Optional[list[dict]]:
    """DB에서 쿠키 로드. 없거나 만료됐으면 None 반환."""
    try:
        rows = (
            supabase.table("foreign_session")
            .select("cookies_json,expires_at")
            .eq("source_code", source_code)
            .limit(1)
            .execute()
            .data
        )
        if not rows:
            return None
        raw = rows[0]["expires_at"].replace("Z", "+00:00")
        if "+" not in raw:
            raw += "+00:00"
        expires_at = datetime.fromisoformat(raw)
        if expires_at < datetime.now(tz=timezone.utc):
            print(f"  [{source_code}] 쿠키 만료 ({expires_at.date()}), 재로그인 필요")
            return None
        cookies = json.loads(rows[0]["cookies_json"])
        print(f"  [{source_code}] 캐시 쿠키 로드 ({len(cookies)}개, 만료: {expires_at.date()})")
        return cookies
    except Exception as e:
        print(f"  [{source_code}] 쿠키 로드 오류: {e}", file=sys.stderr)
        return None


def save_cookies(source_code: str, cookies: list[dict], supabase) -> None:
    """쿠키 DB upsert (TTL 14일)."""
    expires_at = (datetime.now(tz=timezone.utc) + timedelta(days=COOKIE_TTL_DAYS)).isoformat()
    try:
        supabase.table("foreign_session").upsert({
            "source_code": source_code,
            "cookies_json": json.dumps(cookies, ensure_ascii=False),
            "expires_at": expires_at,
            "updated_at": datetime.now(tz=timezone.utc).isoformat(),
        }).execute()
        print(f"  [{source_code}] 쿠키 저장 (만료: {expires_at[:10]})")
    except Exception as e:
        print(f"  [{source_code}] 쿠키 저장 오류: {e}", file=sys.stderr)


async def make_context(playwright, cookies: Optional[list[dict]] = None) -> BrowserContext:
    """Chromium headless 컨텍스트 생성. cookies 주어지면 inject."""
    headless = os.environ.get("HEADLESS", "1") != "0"
    browser = await playwright.chromium.launch(
        headless=headless,
        args=[
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage",
        ],
    )
    ctx = await browser.new_context(
        user_agent=_UA,
        viewport={"width": 1280, "height": 900},
        locale="en-US",
        timezone_id="America/New_York",
        ignore_https_errors=True,
    )
    if cookies:
        await ctx.add_cookies(cookies)
    return ctx


async def new_stealth_page(ctx: BrowserContext) -> Page:
    """stealth 적용된 새 페이지 반환. 봇 감지 우회용."""
    page = await ctx.new_page()
    await stealth_async(page)
    return page


async def extract_body(page: Page, selectors: list[str]) -> Optional[str]:
    """여러 selector를 순서대로 시도해 본문 p 요소 텍스트를 join."""
    for sel in selectors:
        try:
            locs = page.locator(sel)
            count = await locs.count()
            if count < 3:
                continue
            texts = []
            for i in range(count):
                t = (await locs.nth(i).inner_text()).strip()
                if len(t) > 20:
                    texts.append(t)
            if len(texts) >= 3:
                return "\n".join(texts)[:8000]
        except Exception:
            continue
    return None
