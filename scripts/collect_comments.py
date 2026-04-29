"""네이버 기사별 댓글 수 수집 → comment_metric 적재.

대상: 자사(세계일보) + 경쟁사 4개(조선, 중앙, 동아, 매경)
Playwright 헤드리스 브라우저로 실제 댓글 수 추출.

사용:
  python -m scripts.collect_comments
  python -m scripts.collect_comments --hours 24
  python -m scripts.collect_comments --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import math
import re
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

from playwright.async_api import Browser, async_playwright

from scripts.lib.db import get_client

TARGET_MEDIA = ["segye", "chosun", "joongang", "donga", "mk"]
ARTICLE_URL_RE = re.compile(r"n\.news\.naver\.com/(?:mnews/)?article/(\d+)/(\d+)")
MAX_CONCURRENT = 5

# 댓글 수가 표시되는 셀렉터 우선순위
COMMENT_COUNT_SELECTORS = [
    ".u_cbox_count",            # cbox 위젯 안 카운트
    "._COMMENT_COUNT_VIEW em",  # 기사 헤더 카운트 em
    "._COMMENT_COUNT em",
]


def _engagement_score(comment_count: int) -> float:
    return round(min(math.log1p(comment_count) / math.log1p(1000) * 100, 100), 4)


async def _fetch_one(
    browser: Browser, url: str, sem: asyncio.Semaphore
) -> int:
    """Playwright로 기사 URL에서 댓글 수 추출."""
    async with sem:
        page = await browser.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=15_000)

            for selector in COMMENT_COUNT_SELECTORS:
                try:
                    await page.wait_for_selector(selector, timeout=6_000)
                    text = await page.locator(selector).first.inner_text()
                    cleaned = text.replace(",", "").strip()
                    if cleaned.isdigit():
                        return int(cleaned)
                except Exception:
                    continue

            return 0
        except Exception:
            return 0
        finally:
            await page.close()


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hours", type=int, default=24, help="대상 기사 시간 윈도우")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sb = get_client()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=args.hours)).isoformat()

    media_rows = (
        sb.table("media_company")
        .select("media_company_id, name, normalized_name")
        .in_("normalized_name", TARGET_MEDIA)
        .eq("is_active", True)
        .execute()
        .data
    )
    if not media_rows:
        print("대상 매체 없음")
        return

    media_ids = [m["media_company_id"] for m in media_rows]
    media_map = {m["media_company_id"]: m["name"] for m in media_rows}

    articles = (
        sb.table("article")
        .select("article_id, url, media_company_id")
        .in_("media_company_id", media_ids)
        .gte("published_at", cutoff)
        .execute()
        .data
    )
    print(f"대상 기사 {len(articles)}건 (최근 {args.hours}h, {len(media_rows)}개 매체)")

    # 네이버 URL 기사만 필터
    targets: list[tuple[int, int, str]] = []
    for art in articles:
        m = ARTICLE_URL_RE.search(art.get("url") or "")
        if m:
            targets.append((art["article_id"], art["media_company_id"], art["url"]))

    skipped = len(articles) - len(targets)
    print(f"  URL 파싱 성공 {len(targets)}건" + (f" (스킵 {skipped}건)" if skipped else ""))

    if not targets:
        print("수집 가능한 기사 없음 (n.news.naver.com URL 형식 기사가 없음)")
        return

    sem = asyncio.Semaphore(MAX_CONCURRENT)
    now_iso = datetime.now(timezone.utc).isoformat()

    print(f"헤드리스 브라우저 시작 (동시 {MAX_CONCURRENT}개)…")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        counts = await asyncio.gather(
            *[_fetch_one(browser, url, sem) for _, _, url in targets]
        )
        await browser.close()

    metric_rows = []
    for (article_id, media_id, _), comment_count in zip(targets, counts):
        metric_rows.append(
            {
                "article_id": article_id,
                "measured_at": now_iso,
                "comment_count": comment_count,
                "like_count": None,
                "engagement_score": _engagement_score(comment_count),
                "source": "NAVER",
            }
        )

    nonzero = sum(1 for r in metric_rows if r["comment_count"] > 0)
    print(f"  댓글 있는 기사: {nonzero}건 / {len(metric_rows)}건")

    if args.dry_run:
        media_cnt: Counter[int] = Counter(mid for _, mid, _ in targets)
        for mid, cnt in media_cnt.most_common():
            rows_for = [
                r["comment_count"]
                for r, (_, m_id, _) in zip(metric_rows, targets)
                if m_id == mid
            ]
            rows_for.sort(reverse=True)
            print(f"  {media_map.get(mid, mid):<10} {cnt}건, 상위: {rows_for[:3]}")
        print(f"\n[dry-run] {len(metric_rows)}건 적재 생략")
        return

    if metric_rows:
        sb.table("comment_metric").insert(metric_rows).execute()

    media_cnt = Counter(mid for _, mid, _ in targets)
    print(f"\n적재 완료: {len(metric_rows)}건")
    for mid, cnt in media_cnt.most_common():
        print(f"  {media_map.get(mid, mid)}: {cnt}건")


if __name__ == "__main__":
    asyncio.run(main())
