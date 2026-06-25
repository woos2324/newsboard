"""스냅샷 데이터 정리.

대상 테이블 (보존 기간):
  - ranking_news_snapshot (→ ranking_news_item CASCADE): 7일
  - section_ranking_snapshot: 7일
  - comment_metric: 7일
  - missed_issue_alert (reviewing 제외, open/resolved/ignored): 7일
  - trending_keyword: 1일
  - realtime_pv_tick: 2일

사용:
  python -m scripts.cleanup_old_data
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
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    cutoff_7d = (now - timedelta(days=7)).isoformat()
    cutoff_7d_date = (now - timedelta(days=7)).date().isoformat()
    cutoff_1d = (now - timedelta(days=1)).isoformat()
    cutoff_2d = (now - timedelta(days=2)).isoformat()

    print(f"기준일: 7일={cutoff_7d[:10]}, 1일={cutoff_1d[:10]}, 2일={cutoff_2d[:10]}")

    if args.dry_run:
        print("[dry-run] 실제 삭제 생략")
        return

    sb = get_client()

    # 1. ranking_news_snapshot (→ ranking_news_item CASCADE)
    res = (
        sb.table("ranking_news_snapshot")
        .delete()
        .lt("created_at", cutoff_7d)
        .execute()
    )
    print(f"ranking_news_snapshot 삭제: {len(res.data)}건 (ranking_news_item CASCADE)")

    # 2. section_ranking_snapshot
    res = (
        sb.table("section_ranking_snapshot")
        .delete()
        .lt("ranking_date", cutoff_7d_date)
        .execute()
    )
    print(f"section_ranking_snapshot 삭제: {len(res.data)}건")

    # 3. comment_metric
    res = (
        sb.table("comment_metric")
        .delete()
        .lt("created_at", cutoff_7d)
        .execute()
    )
    print(f"comment_metric 삭제: {len(res.data)}건")

    # 4. missed_issue_alert (reviewing 제외)
    res = (
        sb.table("missed_issue_alert")
        .delete()
        .lt("detected_at", cutoff_7d)
        .in_("alert_status", ["open", "resolved", "ignored"])
        .execute()
    )
    print(f"missed_issue_alert 삭제: {len(res.data)}건 (reviewing 제외)")

    # 5. trending_keyword: 1일 보관 (3분 주기 수집, 용량 최다 테이블)
    res = (
        sb.table("trending_keyword")
        .delete()
        .lt("fetched_at", cutoff_1d)
        .execute()
    )
    print(f"trending_keyword 삭제: {len(res.data)}건 (1일 보관)")

    # 6. realtime_pv_tick: 2일 보관 (전일 확정 PV 수집 후 불필요)
    res = (
        sb.table("realtime_pv_tick")
        .delete()
        .lt("captured_at", cutoff_2d)
        .execute()
    )
    print(f"realtime_pv_tick 삭제: {len(res.data)}건 (2일 보관)")

    print("정리 완료")


if __name__ == "__main__":
    main()
