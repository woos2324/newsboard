"""네이버 매체별 인기 랭킹 뉴스 수집 → article + ranking_news_snapshot/item 적재.

사용:
  python -m scripts.collect_ranking
  python -m scripts.collect_ranking --media chosun joongang
  python -m scripts.collect_ranking --limit 5 --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

from scripts.lib.db import get_client, list_media
from scripts.lib.http import fetch_html
from scripts.lib.naver import RANKING_URL_TEMPLATE, RankingItem, parse_ranking_html


async def collect_one(
    media: dict, limit: int
) -> tuple[dict, list[RankingItem], str | None]:
    url = RANKING_URL_TEMPLATE.format(naver_media_id=media["naver_media_id"])
    try:
        html = await fetch_html(url)
        return media, parse_ranking_html(html, limit=limit), None
    except Exception as e:  # noqa: BLE001
        return media, [], str(e)


def _persist(sb, media: dict, items: list[RankingItem], now_iso: str) -> int:
    # published_at = collected_at 으로 fallback (Naver 페이지에서 정확한 발행시각 추출 어려움).
    # 대시보드의 "오늘 기사 수" 와 cluster_articles 의 시간 윈도우 필터(`published_at >= cutoff`)
    # 두 곳 모두 published_at 을 기준으로 하므로 NULL 이면 안 잡힘.
    article_rows = [
        {
            "media_company_id": media["media_company_id"],
            "title": it.title,
            "url": it.url,
            "published_at": now_iso,
            "collected_at": now_iso,
        }
        for it in items
    ]
    # ignore_duplicates=True: 같은 url 재수집 시 첫 published_at 보존 (UPDATE 안 함).
    sb.table("article").upsert(
        article_rows, on_conflict="url", ignore_duplicates=True
    ).execute()

    urls = [it.url for it in items]
    existing = (
        sb.table("article")
        .select("article_id, url")
        .in_("url", urls)
        .execute()
        .data
    )
    url_to_id: dict[str, int] = {r["url"]: r["article_id"] for r in existing}

    snap = (
        sb.table("ranking_news_snapshot")
        .insert(
            {
                "media_company_id": media["media_company_id"],
                "snapshot_at": now_iso,
                "source": "NAVER",
                "category": "popular",
                "collection_status": "success",
            }
        )
        .execute()
        .data[0]
    )

    item_rows = [
        {
            "ranking_snapshot_id": snap["ranking_snapshot_id"],
            "article_id": url_to_id[it.url],
            "rank_position": it.rank,
        }
        for it in items
        if it.url in url_to_id
    ]
    if item_rows:
        sb.table("ranking_news_item").insert(item_rows).execute()
    return len(item_rows)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--media", nargs="*", help="normalized_name 필터")
    parser.add_argument("--limit", type=int, default=20, help="매체별 상위 N건")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    targets = list_media(only_with_naver_id=True, names=args.media)
    if not targets:
        print("대상 매체 없음 (naver_media_id 가 등록된 활성 매체가 없음)")
        return

    print(f"수집 대상 {len(targets)}개, 매체별 상위 {args.limit}건")
    results = await asyncio.gather(
        *(collect_one(m, args.limit) for m in targets)
    )

    sb = get_client()
    now_iso = datetime.now(timezone.utc).isoformat()

    total_articles = 0
    for media, items, err in results:
        if err:
            print(f"  ✗ {media['name']:<10} fetch 실패: {err}")
            continue
        if not items:
            print(
                f"  ✗ {media['name']:<10} 파싱 0건 — selector 검증 필요 (scripts/lib/naver.py)"
            )
            continue
        print(f"  ✓ {media['name']:<10} {len(items)}건")
        if args.dry_run:
            for it in items[:3]:
                print(f"     #{it.rank} {it.title[:50]}")
            continue
        try:
            n = _persist(sb, media, items, now_iso)
            total_articles += n
            print(f"     스냅샷 적재 ({n}개 아이템)")
        except Exception as e:  # noqa: BLE001
            print(f"     ✗ 적재 실패: {e}")

    if args.dry_run:
        print("\n[dry-run] DB 적재 생략")
    else:
        print(f"\n총 적재 {total_articles}개 아이템")


if __name__ == "__main__":
    asyncio.run(main())
