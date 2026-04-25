from fastapi import APIRouter

from api.lib.db import get_client
from api.lib.models import (
    AISummaryOut,
    CommentTopItem,
    DashboardOverview,
    DashboardStat,
    IssueCluster,
    MissedAlert,
    RankingItem,
    SubscriberPoint,
)

router = APIRouter()


@router.get("/overview", response_model=DashboardOverview)
async def get_overview() -> DashboardOverview:
    sb = get_client()

    # 주요 이슈 (오늘자 상위 3)
    issues_rows = (
        sb.table("issue_cluster")
        .select("issue_cluster_id, cluster_key, representative_title, keywords, summary, cluster_date, confidence_score")
        .order("cluster_date", desc=True)
        .order("confidence_score", desc=True)
        .limit(3)
        .execute()
        .data
    )

    # 랭킹 상위 (최근 스냅샷)
    ranking_rows = sb.rpc("get_latest_ranking", {"limit_n": 8}).execute().data if False else []

    # 간단 stat 집계
    total_articles = sb.table("article").select("article_id", count="exact").execute().count or 0
    total_alerts = (
        sb.table("missed_issue_alert")
        .select("missed_issue_alert_id", count="exact")
        .eq("alert_status", "open")
        .execute()
        .count
        or 0
    )

    # 낙종 알림
    alerts_rows = (
        sb.table("missed_issue_alert")
        .select(
            "missed_issue_alert_id, issue_cluster_id, alert_status, competitor_article_count, priority_score, reason, detected_at, issue_cluster(representative_title)"
        )
        .eq("alert_status", "open")
        .order("priority_score", desc=True)
        .limit(5)
        .execute()
        .data
    )

    # 구독자 7일
    sub_rows = (
        sb.table("subscriber_snapshot")
        .select("snapshot_date, subscriber_count, daily_delta, media_company(is_our_company)")
        .order("snapshot_date", desc=True)
        .limit(7)
        .execute()
        .data
    )
    sub_rows = [r for r in sub_rows if (r.get("media_company") or {}).get("is_our_company")]

    # 인기 댓글
    comment_rows = (
        sb.table("comment_metric")
        .select("article_id, comment_count, engagement_score, article(title)")
        .order("engagement_score", desc=True)
        .limit(5)
        .execute()
        .data
    )

    # 일간 AI 요약
    summary_rows = (
        sb.table("ai_summary")
        .select("ai_summary_id, summary_type, summary_date, title, content, quality_score")
        .eq("summary_type", "daily")
        .order("summary_date", desc=True)
        .limit(1)
        .execute()
        .data
    )

    return DashboardOverview(
        stats=[
            DashboardStat(label="오늘 기사 수", value=f"{total_articles:,}", delta=None),
            DashboardStat(label="미처리 낙종", value=str(total_alerts), delta=None),
        ],
        top_issues=[
            IssueCluster(
                issue_cluster_id=r["issue_cluster_id"],
                cluster_key=r["cluster_key"],
                representative_title=r["representative_title"],
                keywords=r.get("keywords"),
                summary=r.get("summary"),
                cluster_date=r["cluster_date"],
                confidence_score=r.get("confidence_score"),
            )
            for r in issues_rows
        ],
        ranking=[
            RankingItem(**item) for item in ranking_rows
        ],
        missed_alerts=[
            MissedAlert(
                missed_issue_alert_id=r["missed_issue_alert_id"],
                issue_cluster_id=r["issue_cluster_id"],
                representative_title=(r.get("issue_cluster") or {}).get("representative_title", ""),
                alert_status=r["alert_status"],
                competitor_article_count=r["competitor_article_count"],
                priority_score=r.get("priority_score"),
                reason=r.get("reason"),
                detected_at=r["detected_at"],
            )
            for r in alerts_rows
        ],
        subscribers=[
            SubscriberPoint(
                snapshot_date=r["snapshot_date"],
                subscriber_count=r["subscriber_count"],
                daily_delta=r.get("daily_delta"),
            )
            for r in sub_rows
        ],
        top_comments=[
            CommentTopItem(
                article_id=r["article_id"],
                title=(r.get("article") or {}).get("title", ""),
                comment_count=r["comment_count"],
                engagement_score=r.get("engagement_score"),
            )
            for r in comment_rows
        ],
        ai_summary=(
            AISummaryOut(**summary_rows[0]) if summary_rows else None
        ),
    )
