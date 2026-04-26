"""자사 매체의 일자별 네이버 발행 기사 수 수집 → daily_publication_count 적재.

cron 매시간 실행: 오늘(KST) + 어제(KST) 카운트 갱신.
오늘은 시간이 지날수록 카운트 증가 / 어제는 안정화되면 더 이상 변동 없음.

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
    PUBLICATION_LIST_URL_TEMPLATE,
    count_publication_links,
)

KST = timezone(timedelta(hours=9))
MAX_PAGES = 30  # 안전 가드: 한 매체 한 날짜에 30 페이지 초과 시 중단


async def fetch_publication_count(naver_media_id: str, date_yyyymmdd: str) -> int:
    """모든 페이지 순회하며 기사 수 합산. 첫 페이지에서 max_page 파악 후 끝까지 fetch."""
    # 1) 첫 페이지
    url = PUBLICATION_LIST_URL_TEMPLATE.format(
        naver_media_id=naver_media_id, date=date_yyyymmdd, page=1
    )
    html = await fetch_html(url)
    page1_count, max_page = count_publication_links(html)
    if max_page <= 1:
        return page1_count

    last_page = min(max_page, MAX_PAGES)
    # 2) 나머지 페이지 병렬 fetch
    coros = []
    for p in range(2, last_page + 1):
        u = PUBLICATION_LIST_URL_TEMPLATE.format(
            naver_media_id=naver_media_id, date=date_yyyymmdd, page=p
        )
        coros.append(fetch_html(u))
    htmls = await asyncio.gather(*coros, return_exceptions=True)

    total = page1_count
    for h in htmls:
        if isinstance(h, Exception):
            continue
        c, _ = count_publication_links(h)
        total += c
    return total


def _our_companies(sb) -> list[dict]:
    rows = (
        sb.table("media_company")
        .select("media_company_id, name, naver_media_id, is_our_company")
        .eq("is_our_company", True)
        .execute()
        .data
    )
    return [r for r in rows if r.get("naver_media_id")]


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--date", help="대상 날짜 (YYYYMMDD). 기본: 오늘 KST + 어제 KST"
    )
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

    print(f"수집 대상 매체 {len(targets)}개, 날짜 {dates_yyyymmdd}")

    rows: list[dict] = []
    for media in targets:
        for d in dates_yyyymmdd:
            try:
                count = await fetch_publication_count(media["naver_media_id"], d)
                d_iso = f"{d[0:4]}-{d[4:6]}-{d[6:8]}"
                print(f"  ✓ {media['name']:<10} {d_iso}  {count}건")
                rows.append(
                    {
                        "media_company_id": media["media_company_id"],
                        "snapshot_date": d_iso,
                        "publication_count": count,
                        "source": "naver",
                    }
                )
            except Exception as e:  # noqa: BLE001
                print(f"  ✗ {media['name']:<10} {d}  실패: {e}")

    if not rows:
        print("적재 데이터 없음")
        return
    if args.dry_run:
        print(f"[dry-run] {len(rows)} 행 적재 생략")
        return

    res = (
        sb.table("daily_publication_count")
        .upsert(rows, on_conflict="media_company_id,snapshot_date,source")
        .execute()
    )
    print(f"적재 완료: {len(res.data)} 행")


if __name__ == "__main__":
    asyncio.run(main())
