from fastapi import APIRouter

from api.lib.db import get_client
from api.lib.models import MissedAlert

router = APIRouter()


@router.get("/gap", response_model=list[MissedAlert])
async def list_missed(status: str = "open", limit: int = 20) -> list[MissedAlert]:
    sb = get_client()
    rows = (
        sb.table("missed_issue_alert")
        .select(
            "missed_issue_alert_id, issue_cluster_id, alert_status, competitor_article_count, "
            "priority_score, reason, detected_at, issue_cluster(representative_title)"
        )
        .eq("alert_status", status)
        .order("priority_score", desc=True)
        .limit(limit)
        .execute()
        .data
    )
    return [
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
        for r in rows
    ]
