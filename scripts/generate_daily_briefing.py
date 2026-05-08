"""오늘의 이슈 클러스터를 바탕으로 일간 브리핑 AI 요약 생성/저장.

FastAPI 의존 없이 실행 — GitHub Actions 등 CI 환경에서 직접 호출 가능.

사용:
  python -m scripts.generate_daily_briefing
  python -m scripts.generate_daily_briefing --date 2026-04-25
  python -m scripts.generate_daily_briefing --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, datetime, timedelta, timezone
from typing import Any

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

from api.lib.ai import generate_daily_briefing
from scripts.lib.db import get_client


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
) -> dict:
    meta = {**source_metadata, "bullets": bullets}
    existing = (
        sb.table("ai_summary")
        .select("ai_summary_id")
        .eq("summary_type", summary_type)
        .eq("summary_date", summary_date)
        .limit(1)
        .execute()
        .data
    )
    payload = {
        "summary_type": summary_type,
        "summary_date": summary_date,
        "title": title,
        "content": content,
        "model_version": model_version,
        "source_metadata": meta,
    }
    if existing:
        row_id = existing[0]["ai_summary_id"]
        sb.table("ai_summary").update(payload).eq("ai_summary_id", row_id).execute()
        return (
            sb.table("ai_summary")
            .select()
            .eq("ai_summary_id", row_id)
            .limit(1)
            .execute()
            .data[0]
        )
    return sb.table("ai_summary").insert(payload).execute().data[0]


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--date",
        help="대상 날짜 (YYYY-MM-DD, 기본: 오늘 UTC). cluster_date 와 매칭됨.",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    _KST = timezone(timedelta(hours=9))
    sb = get_client()
    today_kst = datetime.now(_KST).date().isoformat()
    target_date = args.date or today_kst
    yesterday_utc = (date.today() - timedelta(days=1)).isoformat()
    cluster_from = args.date or yesterday_utc

    clusters_raw = (
        sb.table("issue_cluster")
        .select(
            "issue_cluster_id, cluster_key, representative_title, summary, "
            "keywords, confidence_score, issue_cluster_article(count)"
        )
        .gte("cluster_date", cluster_from)
        .order("confidence_score", desc=True)
        .limit(10)
        .execute()
        .data
    )

    if not clusters_raw:
        print(f"최근 이슈 클러스터가 없어 브리핑을 생성할 수 없습니다.")
        return

    print(f"KST {target_date} 브리핑 — 클러스터 {len(clusters_raw)}개 기반으로 생성")

    clusters: list[dict] = []
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
    except Exception as e:  # noqa: BLE001
        print(f"AI 호출 실패: {e}", file=sys.stderr)
        sys.exit(1)

    title = result.get("title") or f"{target_date} 일간 브리핑"
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

    print(f"\n생성 결과:")
    print(f"  title  : {title}")
    print(f"  summary: {content}")
    for b in enriched_bullets:
        cid = b.get("cluster_id")
        print(f"  • {b['text']}" + (f" [cluster_id={cid}]" if cid else ""))

    if args.dry_run:
        print("\n[dry-run] 저장 생략")
        return

    saved = _upsert_summary(
        sb,
        summary_type="daily",
        summary_date=target_date,  # KST 기준 날짜
        title=title,
        content=content,
        bullets=enriched_bullets,
        model_version=model_used,
        source_metadata={
            "cluster_keys": cluster_keys,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    print(f"\n✓ 저장 완료 ai_summary_id={saved['ai_summary_id']}")


if __name__ == "__main__":
    asyncio.run(main())
