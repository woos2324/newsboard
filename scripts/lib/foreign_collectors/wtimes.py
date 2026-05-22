"""Washington Times 사설 수집기 (Playwright, 무료 — Cloudflare 우회).

인덱스: https://www.washingtontimes.com/opinion/editorials/
로그인 불필요. Playwright로 Cloudflare JS 챌린지를 통과.
"""
from __future__ import annotations

import re
import sys
from typing import Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

from scripts.lib.foreign_collectors.base import ForeignEditorialItem
from scripts.lib.foreign_collectors.playwright_base import make_context

INDEX_URL = "https://www.washingtontimes.com/opinion/editorials/"
BASE = "https://www.washingtontimes.com"
# /opinion/YYYY/... 또는 /opinion/editorials/... 또는 절대 URL 모두 허용
_EDITORIAL_RE = re.compile(r"(?:washingtontimes\.com)?/opinion/(?:\d{4}/[a-z]+/\d{1,2}/|editorials/\d{4}/)")


def _parse_index(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    seen: set[str] = set()
    items = []

    all_hrefs = [a.get("href", "") for a in soup.find_all("a", href=True)]
    print(f"  [wtimes] 전체 링크 {len(all_hrefs)}개, 샘플: {all_hrefs[:3]}", file=sys.stderr)

    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not _EDITORIAL_RE.search(href):
            continue
        title = a.get_text(strip=True)
        if not title or len(title) < 8:
            continue
        full = urljoin(BASE, href)
        if full in seen:
            continue
        seen.add(full)
        items.append({"url": full, "title_original": title})
    return items


def _parse_article(html: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    soup = BeautifulSoup(html, "html.parser")

    title = None
    for sel in ["h1.page-title", "h1.article-headline", "h1.headline", "h1"]:
        el = soup.select_one(sel)
        if el and el.get_text(strip=True):
            title = el.get_text(strip=True)
            break
    if not title:
        og = soup.find("meta", attrs={"property": "og:title"})
        if og:
            title = og.get("content", "").strip()

    published_at = None
    for prop in ["article:published_time", "article:published", "og:published_time"]:
        m = soup.find("meta", attrs={"property": prop})
        if m and m.get("content"):
            published_at = m["content"].strip()
            break
    if not published_at:
        t = soup.find("time")
        if t and t.get("datetime"):
            published_at = t["datetime"].strip()

    body = None
    for sel in ["div.article-content", "div.story-body", "div.bodytext", "div.entry-content", "article"]:
        el = soup.select_one(sel)
        if not el:
            continue
        for junk in el.select("aside, figure, .related, .ad, script, style, .share, .newsletter"):
            junk.decompose()
        text = el.get_text("\n", strip=True)
        if len(text) >= 200:
            body = text[:8000]
            break

    return title, body, published_at


async def collect(limit: int = 10, supabase=None) -> list[ForeignEditorialItem]:
    async with async_playwright() as pw:
        ctx = await make_context(pw)
        page = await ctx.new_page()

        try:
            print("[wtimes] 인덱스 로딩 (Cloudflare 우회 대기 중)")
            await page.goto(INDEX_URL, wait_until="networkidle", timeout=40_000)
            html = await page.content()
        except Exception as e:
            print(f"[wtimes] 인덱스 오류: {e}", file=sys.stderr)
            await ctx.browser.close()
            return []
        finally:
            await page.close()

        index = _parse_index(html)
        print(f"[wtimes] 인덱스 {len(index)}건 발견")
        if not index:
            await ctx.browser.close()
            return []

        results: list[ForeignEditorialItem] = []
        for entry in index[:limit]:
            page = await ctx.new_page()
            try:
                await page.goto(entry["url"], wait_until="domcontentloaded", timeout=30_000)
                await page.wait_for_timeout(1_000)
                article_html = await page.content()
            except Exception as e:
                print(f"  [wtimes] 기사 오류 {entry['url'][:60]}: {e}", file=sys.stderr)
                continue
            finally:
                await page.close()

            title, body, published_at = _parse_article(article_html)
            item: ForeignEditorialItem = {
                "source_code": "wtimes",
                "url": entry["url"],
                "title_original": title or entry["title_original"],
                "body_original": body,
                "author": None,
                "published_at": published_at,
            }
            results.append(item)
            print(f"  [wtimes] {item['title_original'][:60]} | body={len(body) if body else 0}자")

        await ctx.browser.close()

    return results
