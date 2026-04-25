from fastapi import APIRouter

from api.lib.db import get_client

router = APIRouter()


@router.get("/ranking")
async def compare_ranking(category: str | None = None, limit: int = 10) -> dict:
    sb = get_client()
    query = (
        sb.table("ranking_news_snapshot")
        .select(
            "ranking_snapshot_id, snapshot_at, category, media_company(media_company_id, name), "
            "ranking_news_item(rank_position, score, article(article_id, title, url))"
        )
        .order("snapshot_at", desc=True)
        .limit(50)
    )
    if category:
        query = query.eq("category", category)
    rows = query.execute().data

    by_media: dict[str, list[dict]] = {}
    for snap in rows:
        media = (snap.get("media_company") or {}).get("name", "Unknown")
        if media in by_media:
            continue
        items = sorted(snap.get("ranking_news_item") or [], key=lambda x: x["rank_position"])[:limit]
        by_media[media] = [
            {
                "rank": it["rank_position"],
                "title": (it.get("article") or {}).get("title"),
                "url": (it.get("article") or {}).get("url"),
                "score": it.get("score"),
            }
            for it in items
        ]
    return {"ranking": by_media}
