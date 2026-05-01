"""자사 매체의 네이버 발행 기사 전체 수집 → article 테이블 적재 + daily_publication_count 갱신.

cron 매시간 실행: 오늘(KST) + 어제(KST) 수집.
기사 제목·URL 을 article 테이블에 저장하여 미보도 탐지(detect_gap.py)에 활용.

사용:
  python -m scripts.collect_publications              # 오늘 KST + 어제 KST
  python -m scripts.collect_publications --date 20260425
  python -m scripts.collect_publications --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

from scripts.lib.db import get_client
from scripts.lib.http import fetch_html
from scripts.lib.naver import (
    NAVER_SECTIONS,
    PUBLICATION_SECTION_URL_TEMPLATE,
    PublicationArticle,
    parse_publication_articles,
)

KST = timezone(timedelta(hours=9))
MAX_PAGES = 30


async def _fetch_section_articles(naver_media_id: str, date_yyyymmdd: str, sid1: int, section_name: str) -> list[PublicationArticle]:
    """특정 섹션의 모든 페이지 기사 수집."""
    url = PUBLICATION_SECTION_URL_TEMPLATE.format(
        naver_media_id=naver_media_id, date=date_yyyymmdd, sid1=sid1, page=1
    )
    html = await fetch_html(url)
    page1_articles, max_page = parse_publication_articles(html, section=section_name)

    if max_page <= 1:
        return page1_articles

    last_page = min(max_page, MAX_PAGES)
    coros = [
        fetch_html(
            PUBLICATION_SECTION_URL_TEMPLATE.format(
                naver_media_id=naver_media_id, date=date_yyyymmdd, sid1=sid1, page=p
            )
        )
        for p in range(2, last_page + 1)
    ]
    htmls = await asyncio.gather(*coros, return_exceptions=True)

    all_articles = list(page1_articles)
    seen_urls = {a.url for a in page1_articles}

    for h in htmls:
        if isinstance(h, Exception):
            continue
        articles, _ = parse_publication_articles(h, section=section_name)
        for a in articles:
            if a.url not in seen_urls:
                seen_urls.add(a.url)
                all_articles.append(a)

    return all_articles


async def fetch_all_articles(naver_media_id: str, date_yyyymmdd: str) -> list[PublicationArticle]:
    """섹션별로 수집 후 병합. 중복 URL은 첫 번째 섹션 정보 유지."""
    section_coros = [
        _fetch_section_articles(naver_media_id, date_yyyymmdd, sid1, section_name)
        for sid1, section_name in NAVER_SECTIONS.items()
    ]
    results = await asyncio.gather(*section_coros, return_exceptions=True)

    all_articles: list[PublicationArticle] = []
    seen_urls: set[str] = set()

    for result in results:
        if isinstance(result, Exception):
            continue
        for a in result:
            if a.url not in seen_urls:
                seen_urls.add(a.url)
                all_articles.append(a)

    return all_articles


def _our_companies(sb) -> list[dict]:
    rows = (
        sb.table("media_company")
        .select("media_company_id, name, naver_media_id, is_our_company")
        .eq("is_our_company", True)
        .execute()
        .data
    )
    return [r for r in rows if r.get("naver_media_id")]


def _upsert_articles(sb, media: dict, articles: list[PublicationArticle], now_iso: str) -> None:
    if not articles:
        return
    rows = [
        {
            "media_company_id": media["media_company_id"],
            "title": a.title,
            "url": a.url,
            "category": a.section,
            "published_at": now_iso,
            "collected_at": now_iso,
        }
        for a in articles
    ]
    # ignore_duplicates=True: 같은 url 재수집 시 첫 published_at 보존
    sb.table("article").upsert(rows, on_conflict="url", ignore_duplicates=True).execute()

    # 랭킹 크롤러가 먼저 category=null로 삽입한 경우 섹션 정보 backfill
    by_section: dict[str, list[str]] = {}
    for a in articles:
        if a.section:
            by_section.setdefault(a.section, []).append(a.url)
    for section, urls in by_section.items():
        sb.table("article").update({"category": section}).in_("url", urls).is_("category", "null").execute()


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", help="대상 날짜 (YYYYMMDD). 기본: 오늘 KST + 어제 KST")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sb = get_client()
    targets = _our_companies(sb)
    if not targets:
        print("자사 매체(is_our_company=true & naver_media_id 보유) 가 없음")
        return

    today_kst = datetime.now(KST).date()
    yesterday_kst = today_kst - timedelta(days=1)

    if args.date:
        dates_yyyymmdd = [args.date]
    else:
        dates_yyyymmdd = [
            today_kst.strftime("%Y%m%d"),
            yesterday_kst.strftime("%Y%m%d"),
        ]

    now_iso = datetime.now(timezone.utc).isoformat()
    print(f"수집 대상 매체 {len(targets)}개, 날짜 {dates_yyyymmdd}")

    for media in targets:
        for d in dates_yyyymmdd:
            d_iso = f"{d[0:4]}-{d[4:6]}-{d[6:8]}"
            try:
                articles = await fetch_all_articles(media["naver_media_id"], d)
                count = len(articles)
                print(f"  ✓ {media['name']:<10} {d_iso}  {count}건")

                if args.dry_run:
                    continue

                _upsert_articles(sb, media, articles, now_iso)

                sb.table("daily_publication_count").upsert(
                    {
                        "media_company_id": media["media_company_id"],
                        "snapshot_date": d_iso,
                        "publication_count": count,
                        "source": "naver",
                    },
                    on_conflict="media_company_id,snapshot_date,source",
                ).execute()

            except Exception as e:  # noqa: BLE001
                print(f"  ✗ {media['name']:<10} {d}  실패: {e}")

    if args.dry_run:
        print("[dry-run] DB 쓰기 생략")


if __name__ == "__main__":
    asyncio.run(main())
