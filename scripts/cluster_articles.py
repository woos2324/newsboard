"""미할당 기사 임베딩 클러스터링 → issue_cluster / issue_cluster_article 자동 생성.

사용:
  python -m scripts.cluster_articles
  python -m scripts.cluster_articles --hours 48 --threshold 0.82
  python -m scripts.cluster_articles --dry-run           # AI 메타 생성 포함 시뮬레이션 (AI 호출 생략)
  python -m scripts.cluster_articles --min-size 2        # 2건 이상 모인 이슈만 적재
"""
from __future__ import annotations

import argparse
import asyncio
import secrets
import sys
from datetime import date, datetime, timedelta, timezone

# Windows 콘솔(cp949) 에서 한글·체크마크 출력 시 UnicodeEncodeError 방지
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

from api.lib.ai import embed, generate_cluster_metadata
from scripts.lib.cluster import (
    average_intra_cluster_similarity,
    cosine,
    greedy_cluster,
    pick_representative,
)
from scripts.lib.db import get_client


def _load_unassigned_articles(sb, cutoff_iso: str) -> list[dict]:
    assigned = {
        r["article_id"]
        for r in sb.table("issue_cluster_article")
        .select("article_id")
        .execute()
        .data
    }
    rows = (
        sb.table("article")
        .select(
            "article_id, title, url, category, published_at, "
            "media_company:media_company_id(name)"
        )
        .gte("published_at", cutoff_iso)
        .order("published_at", desc=True)
        .execute()
        .data
    )
    return [r for r in rows if r["article_id"] not in assigned]


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--hours", type=int, default=24, help="대상 기사 시간 윈도우 (기본 24h)"
    )
    parser.add_argument(
        "--threshold", type=float, default=0.85, help="같은 클러스터 판정 cosine 임계값"
    )
    parser.add_argument(
        "--min-size", type=int, default=2, help="클러스터 최소 기사 수 (기본 2)"
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sb = get_client()

    cutoff_iso = (
        datetime.now(timezone.utc) - timedelta(hours=args.hours)
    ).isoformat()
    articles = _load_unassigned_articles(sb, cutoff_iso)

    if not articles:
        print("클러스터링할 미할당 기사가 없습니다.")
        return

    print(f"대상 기사 {len(articles)}건 (최근 {args.hours}h, 미할당)")

    # 임베딩
    try:
        embeddings, embed_model = await embed([a["title"] for a in articles])
    except Exception as e:  # noqa: BLE001
        print(f"✗ 임베딩 실패: {e}")
        return

    # 그리디 클러스터링
    groups = greedy_cluster(embeddings, threshold=args.threshold)
    print(f"후보 클러스터 {len(groups)}개 (threshold={args.threshold})")

    kept = [g for g in groups if len(g) >= args.min_size]
    if len(kept) != len(groups):
        print(f"min_size={args.min_size} 적용 → {len(kept)}개 채택")

    today = date.today().isoformat()
    created = 0

    for idx, group in enumerate(kept, start=1):
        repr_idx = pick_representative(embeddings, group)
        group_articles = [articles[i] for i in group]
        group_titles = [a["title"] for a in group_articles]
        repr_article = articles[repr_idx]
        intra = average_intra_cluster_similarity(embeddings, group)

        # AI 메타 생성 (dry-run 이면 skip)
        if args.dry_run:
            repr_title = repr_article["title"]
            summary: str | None = None
            keywords: list[str] = []
            meta_model = "skipped"
        else:
            try:
                meta, meta_model = await generate_cluster_metadata(group_titles)
                repr_title = meta.get("title") or repr_article["title"]
                summary = meta.get("summary")
                kw_raw = meta.get("keywords") or []
                keywords = [str(k) for k in kw_raw if k][:5]
            except Exception as e:  # noqa: BLE001
                print(f"  ! 클러스터 #{idx} AI 메타 실패 ({e}) → 제목 fallback")
                repr_title = repr_article["title"]
                summary = None
                keywords = []
                meta_model = "error"

        print(
            f"  ✓ #{idx} ({len(group)}건, 내부평균 {intra:.2f}): "
            f"{repr_title[:50]}"
        )
        for a in group_articles:
            mc = a.get("media_company") or {}
            prefix = "★" if a["article_id"] == repr_article["article_id"] else " "
            print(f"     {prefix} [{mc.get('name') or '-'}] {a['title'][:60]}")

        if args.dry_run:
            continue

        cluster_key = f"{today}-auto-{secrets.token_hex(4)}"
        cluster_row = (
            sb.table("issue_cluster")
            .insert(
                {
                    "cluster_key": cluster_key,
                    "representative_title": repr_title,
                    "keywords": keywords,
                    "summary": summary,
                    "cluster_date": today,
                    "confidence_score": round(intra, 4),
                    "model_version": f"embed:{embed_model}+meta:{meta_model}",
                }
            )
            .execute()
            .data[0]
        )

        link_rows = []
        for a_local_idx, art_global_idx in enumerate(group):
            sim_to_repr = cosine(
                embeddings[art_global_idx], embeddings[repr_idx]
            )
            link_rows.append(
                {
                    "issue_cluster_id": cluster_row["issue_cluster_id"],
                    "article_id": articles[art_global_idx]["article_id"],
                    "similarity_score": round(sim_to_repr, 4),
                    "is_representative": art_global_idx == repr_idx,
                }
            )
        sb.table("issue_cluster_article").insert(link_rows).execute()
        created += 1

    if args.dry_run:
        print(f"\n[dry-run] {len(kept)}개 후보 클러스터 — DB 적재 생략")
    else:
        print(f"\n신규 클러스터 {created}개 적재 완료")


if __name__ == "__main__":
    asyncio.run(main())
