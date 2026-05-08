"""7일 이전 스냅샷 데이터 정리.

대상 테이블:
  - ranking_news_snapshot (→ ranking_news_item CASCADE)
  - section_ranking_snapshot
  - comment_metric
  - missed_issue_alert (reviewing 제외, open/resolved/ignored)
  - trending_keyword

사용:
  python -m scripts.cleanup_old_data
  python -m scripts.cleanup_old_data --days 7
  python -m scripts.cleanup_old_data --dry-run
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

from scripts.lib.db import get_client


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=7, help="보존 기간 (일)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    cutoff = (datetime.now(timezone.utc) - timedelta(days=args.days)).isoformat()
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=args.days)).date().isoformat()

    print(f"기준일: {cutoff} ({args.days}일 이전 데이터 삭제)")

    if args.dry_run:
        print("[dry-run] 실제 삭제 생략")
        return

    sb = get_client()

    # 1. ranking_news_snapshot (→ ranking_news_item CASCADE)
    res = (
        sb.table("ranking_news_snapshot")
        .delete()
        .lt("created_at", cutoff)
        .execute()
    )
    print(f"ranking_news_snapshot 삭제: {len(res.data)}건 (ranking_news_item CASCADE)")

    # 2. section_ranking_snapshot
    res = (
        sb.table("section_ranking_snapshot")
        .delete()
        .lt("ranking_date", cutoff_date)
        .execute()
    )
    print(f"section_ranking_snapshot 삭제: {len(res.data)}건")

    # 3. comment_metric
    res = (
        sb.table("comment_metric")
        .delete()
        .lt("created_at", cutoff)
        .execute()
    )
    print(f"comment_metric 삭제: {len(res.data)}건")

    # 4. missed_issue_alert (reviewing 제외)
    res = (
        sb.table("missed_issue_alert")
        .delete()
        .lt("detected_at", cutoff)
        .in_("alert_status", ["open", "resolved", "ignored"])
        .execute()
    )
    print(f"missed_issue_alert 삭제: {len(res.data)}건 (reviewing 제외)")

    # 5. trending_keyword
    res = (
        sb.table("trending_keyword")
        .delete()
        .lt("fetched_at", cutoff)
        .execute()
    )
    print(f"trending_keyword 삭제: {len(res.data)}건")

    print("정리 완료")


if __name__ == "__main__":
    main()
