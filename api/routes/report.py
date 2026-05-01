from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException

from api.lib.ai import generate_daily_briefing, generate_issue_summary
from api.lib.db import get_client
from api.lib.models import AISummaryOut

router = APIRouter()


def _row_to_out(row: dict) -> AISummaryOut:
    meta = row.get("source_metadata") or {}
    bullets = meta.get("bullets") if isinstance(meta, dict) else None
    return AISummaryOut(
        ai_summary_id=row["ai_summary_id"],
        summary_type=row["summary_type"],
        summary_date=row["summary_date"],
        title=row["title"],
        content=row["content"],
        bullets=list(bullets) if isinstance(bullets, list) else [],
        model_version=row.get("model_version") or "",
        quality_score=row.get("quality_score"),
    )


def _upsert_summary(
    sb,
    *,
    summary_type: str,
    summary_date: str,
    title: str,
    content: str,
    bullets: list,
    model_version: str,
    source_metadata: dict[str, Any],
    issue_cluster_id: int | None = None,
) -> dict:
    """같은 (summary_type, summary_date [, issue_cluster_id]) 조합이 있으면 UPDATE, 없으면 INSERT."""
    meta = {**source_metadata, "bullets": bullets}

    q = (
        sb.table("ai_summary")
        .select("ai_summary_id")
        .eq("summary_type", summary_type)
        .eq("summary_date", summary_date)
    )
    if issue_cluster_id is not None:
        q = q.eq("issue_cluster_id", issue_cluster_id)
    existing = q.limit(1).execute().data

    payload = {
        "summary_type": summary_type,
        "summary_date": summary_date,
        "title": title,
        "content": content,
        "model_version": model_version,
        "source_metadata": meta,
        "issue_cluster_id": issue_cluster_id,
    }

    if existing:
        row_id = existing[0]["ai_summary_id"]
        saved = (
            sb.table("ai_summary")
            .update(payload)
            .eq("ai_summary_id", row_id)
            .execute()
            .data[0]
        )
    else:
        saved = sb.table("ai_summary").insert(payload).execute().data[0]
    return saved


@router.get("/report", response_model=list[AISummaryOut])
async def list_reports(summary_type: str = "daily", limit: int = 10) -> list[AISummaryOut]:
    sb = get_client()
    rows = (
        sb.table("ai_summary")
        .select(
            "ai_summary_id, summary_type, summary_date, title, content, "
            "model_version, source_metadata, quality_score"
        )
        .eq("summary_type", summary_type)
        .order("summary_date", desc=True)
        .limit(limit)
        .execute()
        .data
    )
    return [_row_to_out(r) for r in rows]


_KST = timezone(timedelta(hours=9))


@router.post("/report/daily", response_model=AISummaryOut)
async def generate_daily() -> AISummaryOut:
    sb = get_client()
    today_kst = datetime.now(_KST).date().isoformat()
    yesterday_utc = (date.today() - timedelta(days=1)).isoformat()

    # KST 오늘 날짜 기준, 클러스터는 최근 2일치에서 confidence 상위 10개
    clusters_raw = (
        sb.table("issue_cluster")
        .select(
            "issue_cluster_id, cluster_key, representative_title, summary, keywords, "
            "confidence_score, issue_cluster_article(count)"
        )
        .gte("cluster_date", yesterday_utc)
        .order("confidence_score", desc=True)
        .limit(10)
        .execute()
        .data
    )

    if not clusters_raw:
        raise HTTPException(
            status_code=404,
            detail=f"최근 이슈 클러스터가 없어 요약을 생성할 수 없습니다.",
        )

    clusters = []
    cluster_keys: list[str] = []
    for c in clusters_raw:
        rel = c.get("issue_cluster_article") or []
        count = rel[0]["count"] if rel and isinstance(rel, list) else 0
        clusters.append(
            {
                "representative_title": c["representative_title"],
                "summary": c.get("summary"),
                "keywords": c.get("keywords") or [],
                "article_count": count,
            }
        )
        cluster_keys.append(c["cluster_key"])

    try:
        result, model_used = await generate_daily_briefing(clusters)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI 요약 생성 실패: {e}") from e

    title = result.get("title") or f"{today} 일간 브리핑"
    content = result.get("summary") or ""
    bullets_raw = result.get("bullets") or []

    enriched_bullets: list[dict] = []
    for b in bullets_raw if isinstance(bullets_raw, list) else []:
        if isinstance(b, dict):
            idx = b.get("cluster_index")
            text = b.get("text", "")
            if isinstance(idx, int) and 0 <= idx < len(clusters_raw):
                cr = clusters_raw[idx]
                enriched_bullets.append({
                    "text": text,
                    "cluster_id": cr["issue_cluster_id"],
                    "cluster_title": cr["representative_title"],
                })
            else:
                enriched_bullets.append({"text": text, "cluster_id": None, "cluster_title": None})
        elif isinstance(b, str):
            enriched_bullets.append({"text": b, "cluster_id": None, "cluster_title": None})

    saved = _upsert_summary(
        sb,
        summary_type="daily",
        summary_date=today_kst,
        title=title,
        content=content,
        bullets=enriched_bullets,
        model_version=model_used,
        source_metadata={
            "cluster_keys": cluster_keys,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return _row_to_out(saved)


@router.post("/report/issue/{cluster_id}", response_model=AISummaryOut)
async def generate_issue(cluster_id: int) -> AISummaryOut:
    sb = get_client()

    cluster = (
        sb.table("issue_cluster")
        .select("issue_cluster_id, cluster_key, representative_title, cluster_date")
        .eq("issue_cluster_id", cluster_id)
        .limit(1)
        .execute()
        .data
    )
    if not cluster:
        raise HTTPException(status_code=404, detail=f"cluster_id={cluster_id} 없음")
    c = cluster[0]

    rel = (
        sb.table("issue_cluster_article")
        .select(
            "similarity_score, "
            "article:article_id(title, url, media_company:media_company_id(name))"
        )
        .eq("issue_cluster_id", cluster_id)
        .order("similarity_score", desc=True)
        .limit(20)
        .execute()
        .data
    )

    articles: list[dict] = []
    for r in rel:
        art = r.get("article") or {}
        mc = art.get("media_company") or {}
        if not art.get("title"):
            continue
        articles.append(
            {
                "title": art["title"],
                "media": mc.get("name") or "-",
                "url": art.get("url"),
            }
        )

    if not articles:
        raise HTTPException(
            status_code=404,
            detail="관련 기사가 없어 이슈 요약을 생성할 수 없습니다.",
        )

    try:
        result, model_used = await generate_issue_summary(
            c["representative_title"], articles
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI 요약 생성 실패: {e}") from e

    title = result.get("title") or c["representative_title"]
    content = result.get("summary") or ""
    bullets = result.get("bullets") or []

    saved = _upsert_summary(
        sb,
        summary_type="issue",
        summary_date=c["cluster_date"],
        title=title,
        content=content,
        bullets=bullets if isinstance(bullets, list) else [],
        model_version=model_used,
        source_metadata={
            "cluster_key": c["cluster_key"],
            "article_count": len(articles),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        issue_cluster_id=cluster_id,
    )
    return _row_to_out(saved)
