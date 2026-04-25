from fastapi import APIRouter

from api.lib.db import get_client
from api.lib.models import CommentTopItem

router = APIRouter()


@router.get("/comments/top", response_model=list[CommentTopItem])
async def top_commented(limit: int = 10) -> list[CommentTopItem]:
    sb = get_client()
    rows = (
        sb.table("comment_metric")
        .select("article_id, comment_count, engagement_score, article(title)")
        .order("engagement_score", desc=True)
        .limit(limit)
        .execute()
        .data
    )
    return [
        CommentTopItem(
            article_id=r["article_id"],
            title=(r.get("article") or {}).get("title", ""),
            comment_count=r["comment_count"],
            engagement_score=r.get("engagement_score"),
        )
        for r in rows
    ]
