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
import re
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
from scripts.lib.revalidate import revalidate

_NORMALIZE_RE = re.compile("[^0-9A-Za-z\uAC00-\uD7A3]+")


def _chunks(values: list[int], size: int = 200) -> list[list[int]]:
    return [values[i : i + size] for i in range(0, len(values), size)]


def _load_unassigned_articles(sb, cutoff_iso: str) -> list[dict]:
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

    candidate_ids = [r["article_id"] for r in rows]
    assigned: set[int] = set()
    for ids in _chunks(candidate_ids):
        assigned.update(
            r["article_id"]
            for r in sb.table("issue_cluster_article")
            .select("article_id")
            .in_("article_id", ids)
            .execute()
            .data
        )

    return [r for r in rows if r["article_id"] not in assigned]


def _distinct_media_count(group: list[int], articles: list[dict]) -> int:
    names = {
        (articles[i].get("media_company") or {}).get("name")
        for i in group
    }
    return len({name for name in names if name})


def _normalize_text(value: str) -> str:
    return _NORMALIZE_RE.sub("", value.lower())


def _bigrams(value: str) -> set[str]:
    normalized = _normalize_text(value)
    grams = {normalized[i : i + 2] for i in range(max(0, len(normalized) - 1))}
    if not grams and normalized:
        grams.add(normalized)
    return grams


def _overlap_ratio(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / min(len(left), len(right))


def _text_similarity(left: str, right: str) -> float:
    return _overlap_ratio(_bigrams(left), _bigrams(right))


def _keyword_overlap(left: list[str], right: list[str]) -> float:
    left_set = {_normalize_text(k) for k in left if _normalize_text(k)}
    right_set = {_normalize_text(k) for k in right if _normalize_text(k)}
    if len(left_set & right_set) < 2:
        return 0.0
    return _overlap_ratio(left_set, right_set)


def _load_recent_clusters(sb, days: int = 2) -> list[dict]:
    since = (date.today() - timedelta(days=days - 1)).isoformat()
    return (
        sb.table("issue_cluster")
        .select("issue_cluster_id, representative_title, keywords, confidence_score")
        .gte("cluster_date", since)
        .order("cluster_date", desc=True)
        .order("confidence_score", desc=True)
        .limit(300)
        .execute()
        .data
    )


def _find_similar_cluster(
    existing_clusters: list[dict],
    title: str,
    keywords: list[str],
) -> dict | None:
    best: dict | None = None
    best_score = 0.0
    normalized_title = _normalize_text(title)

    for cluster in existing_clusters:
        existing_title = cluster.get("representative_title") or ""
        title_score = _text_similarity(title, existing_title)
        keyword_score = _keyword_overlap(keywords, cluster.get("keywords") or [])
        exact_title = normalized_title == _normalize_text(existing_title)

        if exact_title:
            score = 1.0
        elif title_score >= 0.55:
            score = title_score
        elif keyword_score >= 0.4:
            score = keyword_score
        else:
            continue

        if score > best_score:
            best = cluster
            best_score = score

    return best


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
    parser.add_argument(
        "--min-media",
        type=int,
        default=2,
        help="클러스터 최소 고유 매체 수 (기본 2)",
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

    kept = [
        g
        for g in groups
        if len(g) >= args.min_size
        and _distinct_media_count(g, articles) >= args.min_media
    ]
    if len(kept) != len(groups):
        print(
            f"min_size={args.min_size}, min_media={args.min_media} 적용 "
            f"→ {len(kept)}개 채택"
        )

    today = date.today().isoformat()
    existing_clusters = _load_recent_clusters(sb)
    created = 0
    absorbed = 0

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
                await asyncio.sleep(1)
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

        similar_cluster = _find_similar_cluster(
            existing_clusters, repr_title, keywords
        )
        if similar_cluster:
            cluster_row = similar_cluster
            print(
                "    ↳ 기존 클러스터 "
                f"#{cluster_row['issue_cluster_id']}에 흡수"
            )
            absorbed += 1
        else:
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
            existing_clusters.append(
                {
                    "issue_cluster_id": cluster_row["issue_cluster_id"],
                    "representative_title": repr_title,
                    "keywords": keywords,
                    "confidence_score": round(intra, 4),
                }
            )
            created += 1

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

    if args.dry_run:
        print(f"\n[dry-run] {len(kept)}개 후보 클러스터 — DB 적재 생략")
    else:
        print(f"\n신규 클러스터 {created}개, 기존 흡수 {absorbed}개 완료")
    revalidate("dashboard", dry_run=args.dry_run)


if __name__ == "__main__":
    asyncio.run(main())
