from fastapi import APIRouter, HTTPException

from api.lib.db import get_client
from api.lib.models import IssueCluster

router = APIRouter()


@router.get("/issues", response_model=list[IssueCluster])
async def list_issues(limit: int = 20) -> list[IssueCluster]:
    sb = get_client()
    rows = (
        sb.table("issue_cluster")
        .select("issue_cluster_id, cluster_key, representative_title, keywords, summary, cluster_date, confidence_score")
        .order("cluster_date", desc=True)
        .order("confidence_score", desc=True)
        .limit(limit)
        .execute()
        .data
    )
    return [IssueCluster(**r) for r in rows]


@router.get("/issues/{cluster_id}")
async def get_issue(cluster_id: int) -> dict:
    sb = get_client()
    cluster = (
        sb.table("issue_cluster")
        .select("*")
        .eq("issue_cluster_id", cluster_id)
        .single()
        .execute()
        .data
    )
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    articles = (
        sb.table("issue_cluster_article")
        .select("similarity_score, is_representative, article(article_id, title, url, published_at, media_company(name))")
        .eq("issue_cluster_id", cluster_id)
        .order("similarity_score", desc=True)
        .execute()
        .data
    )
    return {"cluster": cluster, "articles": articles}
