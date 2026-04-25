"""네이버 구독자수 수집 → subscriber_snapshot 적재.

`https://media.naver.com/press/{id}/channel/followers.json` JSON 엔드포인트 사용.

사용:
  python -m scripts.collect_subscribers
  python -m scripts.collect_subscribers --media chosun joongang
  python -m scripts.collect_subscribers --dry-run
  python -m scripts.collect_subscribers --debug      # raw JSON 응답 일부 출력
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import date, timedelta

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

from scripts.lib.db import get_client, list_media
from scripts.lib.http import fetch_json
from scripts.lib.naver import SUBSCRIBER_API_URL_TEMPLATE, extract_subscriber_count


async def collect_one(
    media: dict, *, debug: bool = False
) -> tuple[dict, int | None, str | None, dict | None]:
    url = SUBSCRIBER_API_URL_TEMPLATE.format(naver_media_id=media["naver_media_id"])
    try:
        data = await fetch_json(url)
        count = extract_subscriber_count(data)
        return media, count, None, (data if debug else None)
    except Exception as e:  # noqa: BLE001
        return media, None, str(e), None


def _compute_deltas(
    sb, media_company_id: int, today: str, count: int
) -> tuple[int | None, int | None]:
    prev = (
        sb.table("subscriber_snapshot")
        .select("subscriber_count")
        .eq("media_company_id", media_company_id)
        .eq("source", "naver")
        .lt("snapshot_date", today)
        .order("snapshot_date", desc=True)
        .limit(1)
        .execute()
        .data
    )
    seven_ago = (date.fromisoformat(today) - timedelta(days=7)).isoformat()
    prev7 = (
        sb.table("subscriber_snapshot")
        .select("subscriber_count")
        .eq("media_company_id", media_company_id)
        .eq("source", "naver")
        .lte("snapshot_date", seven_ago)
        .order("snapshot_date", desc=True)
        .limit(1)
        .execute()
        .data
    )
    daily = count - prev[0]["subscriber_count"] if prev else None
    seven = count - prev7[0]["subscriber_count"] if prev7 else None
    return daily, seven


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--media", nargs="*", help="normalized_name 필터")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--debug", action="store_true", help="raw JSON 응답 일부 출력"
    )
    args = parser.parse_args()

    targets = list_media(only_with_naver_id=True, names=args.media)
    if not targets:
        print("대상 매체 없음 (naver_media_id 가 등록된 활성 매체가 없음)")
        return

    print(f"수집 대상 {len(targets)}개")
    results = await asyncio.gather(
        *(collect_one(m, debug=args.debug) for m in targets)
    )

    sb = get_client()
    today = date.today().isoformat()

    rows: list[dict] = []
    fail = 0
    for media, count, err, raw in results:
        if args.debug and raw is not None:
            snippet = json.dumps(raw, ensure_ascii=False)[:200]
            print(f"  · raw[{media['name']}]: {snippet}")
        if err or count is None:
            print(f"  ✗ {media['name']:<10} 실패 ({err or 'parse 0건'})")
            fail += 1
            continue
        daily_delta, seven_day_delta = _compute_deltas(
            sb, media["media_company_id"], today, count
        )
        d_str = f" Δ일 {daily_delta:+,}" if daily_delta is not None else ""
        d7_str = (
            f" Δ7일 {seven_day_delta:+,}" if seven_day_delta is not None else ""
        )
        print(f"  ✓ {media['name']:<10} {count:,}{d_str}{d7_str}")
        rows.append(
            {
                "media_company_id": media["media_company_id"],
                "snapshot_date": today,
                "subscriber_count": count,
                "daily_delta": daily_delta,
                "seven_day_delta": seven_day_delta,
                "source": "naver",
            }
        )

    print(f"\n성공 {len(rows)}건 / 실패 {fail}건")

    if not rows:
        print("적재할 데이터 없음")
        return

    if args.dry_run:
        print(f"[dry-run] {len(rows)} 행 적재 생략")
        return

    res = (
        sb.table("subscriber_snapshot")
        .upsert(rows, on_conflict="media_company_id,snapshot_date,source")
        .execute()
    )
    print(f"적재 완료: {len(res.data)} 행")


if __name__ == "__main__":
    asyncio.run(main())
