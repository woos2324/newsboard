"""
과거 사설 데이터 전용 백필 스크립트.

기존 collect_editorials cron은 사설 수집 후 AI 분석까지 수행한다. 이 스크립트는
과거 구간의 원천 데이터만 채우기 위해 별도로 사용하며, summary/topic/issue/
stance_score/stance_label/ai_analysis 컬럼은 생성하거나 수정하지 않는다.

실행 예시:
    python -m scripts.collect_editorials_data_backfill --date 20260318
    python -m scripts.collect_editorials_data_backfill --date-from 20260301 --date-to 20260324
    python -m scripts.collect_editorials_data_backfill --date-from 20260301 --date-to 20260324 --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta

import httpx

from scripts.collect_editorials import (
    ALLOWED_MEDIA_IDS,
    KST,
    fetch_article_body,
    fetch_editorial_api_page,
    fetch_editorial_list,
)
from scripts.lib.db import get_client

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def _date_to_edition_date(date: str) -> str:
    return f"{date[:4]}-{date[4:6]}-{date[6:8]}"


def _date_to_midnight_iso(date: str) -> str:
    dt = datetime(int(date[:4]), int(date[4:6]), int(date[6:8]), tzinfo=KST)
    return dt.isoformat()


async def _fetch_unique_items(http_client: httpx.AsyncClient, date: str) -> list[dict]:
    items = await fetch_editorial_list(http_client, date)

    page = 1
    while True:
        extra = await fetch_editorial_api_page(http_client, date, page)
        if not extra:
            break
        items.extend(extra)
        page += 1

    seen: set[str] = set()
    unique_items = []
    for item in items:
        url = item["url"]
        if url in seen:
            continue
        seen.add(url)
        unique_items.append(item)

    print(f"  목록: {len(unique_items)}건 (HTML+API {page - 1}페이지)")
    return unique_items


def _build_update_fields(
    *,
    existing: dict,
    media_company_id: int,
    body: str | None,
    published_at: str | None,
    edition_date: str,
) -> dict:
    fields: dict = {"edition_date": edition_date}

    if existing.get("media_company_id") is None:
        fields["media_company_id"] = media_company_id
    if body and not existing.get("body"):
        fields["body"] = body
    if published_at and not existing.get("published_at"):
        fields["published_at"] = published_at

    return fields


async def collect_date(date: str, dry_run: bool) -> dict[str, int]:
    print(f"\n[data-backfill] {date}")

    supabase = get_client()
    media_rows = (
        supabase.table("media_company")
        .select("media_company_id,name,normalized_name")
        .execute()
        .data
    )
    name_map = {r["name"]: r["media_company_id"] for r in media_rows}

    edition_date = _date_to_edition_date(date)
    fallback_published_at = _date_to_midnight_iso(date)
    stats = {"inserted": 0, "updated": 0, "skipped_existing": 0, "skipped_media": 0}

    async with httpx.AsyncClient() as http_client:
        items = await _fetch_unique_items(http_client, date)
        if not items:
            print("  [경고] 사설 목록을 가져오지 못했습니다.")
            return stats

        for item in items:
            title = item["title"]
            url = item["url"]
            press_name = item["press_name"]
            media_company_id = name_map.get(press_name)

            if media_company_id not in ALLOWED_MEDIA_IDS:
                stats["skipped_media"] += 1
                continue

            body, article_published_at = await fetch_article_body(http_client, url)
            published_at = article_published_at or fallback_published_at

            if dry_run:
                body_status = f"{len(body)}자" if body else "본문 없음"
                print(f"  [dry] [{press_name}] {title[:45]} | {body_status}")
                continue

            existing_rows = (
                supabase.table("editorial")
                .select("editorial_id,media_company_id,body,published_at")
                .eq("url", url)
                .limit(1)
                .execute()
                .data
            )

            if existing_rows:
                existing = existing_rows[0]
                update_fields = _build_update_fields(
                    existing=existing,
                    media_company_id=media_company_id,
                    body=body,
                    published_at=article_published_at,
                    edition_date=edition_date,
                )
                meaningful_update = any(k != "edition_date" for k in update_fields)
                if meaningful_update or existing.get("published_at") or existing.get("body"):
                    supabase.table("editorial").update(update_fields).eq("url", url).execute()
                    stats["updated"] += 1
                    print(f"  [updated] [{press_name}] {title[:45]} | fields={list(update_fields)}")
                else:
                    stats["skipped_existing"] += 1
                    print(f"  [skip] [{press_name}] {title[:45]}")
                continue

            row = {
                "media_company_id": media_company_id,
                "title": title,
                "url": url,
                "body": body,
                "published_at": published_at,
                "edition_date": edition_date,
            }
            supabase.table("editorial").insert(row).execute()
            stats["inserted"] += 1
            print(f"  [inserted] [{press_name}] {title[:45]}")

    print(
        "  완료: "
        f"inserted={stats['inserted']} updated={stats['updated']} "
        f"skipped_existing={stats['skipped_existing']} skipped_media={stats['skipped_media']}"
    )
    return stats


async def main(date: str | None, date_from: str | None, date_to: str | None, dry_run: bool) -> None:
    if date:
        await collect_date(date, dry_run)
        return

    if not date_from or not date_to:
        print("--date 또는 --date-from/--date-to 옵션이 필요합니다.", file=sys.stderr)
        sys.exit(2)

    dt_from = datetime(int(date_from[:4]), int(date_from[4:6]), int(date_from[6:8]), tzinfo=KST)
    dt_to = datetime(int(date_to[:4]), int(date_to[4:6]), int(date_to[6:8]), tzinfo=KST)
    if dt_from > dt_to:
        print("--date-from 은 --date-to 보다 늦을 수 없습니다.", file=sys.stderr)
        sys.exit(2)

    total = (dt_to - dt_from).days + 1
    totals = {"inserted": 0, "updated": 0, "skipped_existing": 0, "skipped_media": 0}
    print(f"[data-backfill] range={date_from}~{date_to} dry_run={dry_run} days={total}")

    for i in range(total):
        target = (dt_from + timedelta(days=i)).strftime("%Y%m%d")
        stats = await collect_date(target, dry_run)
        for key in totals:
            totals[key] += stats[key]

    print(
        "\n[data-backfill] 전체 완료: "
        f"inserted={totals['inserted']} updated={totals['updated']} "
        f"skipped_existing={totals['skipped_existing']} skipped_media={totals['skipped_media']}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--date", type=str, help="수집 날짜 YYYYMMDD")
    parser.add_argument("--date-from", type=str, help="수집 시작일 YYYYMMDD")
    parser.add_argument("--date-to", type=str, help="수집 종료일 YYYYMMDD")
    args = parser.parse_args()
    asyncio.run(main(args.date, args.date_from, args.date_to, args.dry_run))
