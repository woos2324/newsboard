"""클러스터 기반 미보도 탐지 → missed_issue_alert 적재.

사용:
  python -m scripts.detect_gap
  python -m scripts.detect_gap --days 2        # 오늘+어제 클러스터 검사
  python -m scripts.detect_gap --min-competitors 3
  python -m scripts.detect_gap --dry-run
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, timedelta, timezone

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

from scripts.lib.db import get_client

KST = timezone(timedelta(hours=9))


def today_kst() -> date:
    return datetime.now(KST).date()


def _load_our_company(sb) -> dict:
    rows = (
        sb.table("media_company")
        .select("media_company_id, name, normalized_name")
        .eq("is_our_company", True)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise RuntimeError("자사 매체(is_our_company=TRUE) 가 DB에 없습니다.")
    return rows[0]


def _load_clusters(sb, dates: list[str]) -> list[dict]:
    return (
        sb.table("issue_cluster")
        .select("issue_cluster_id, representative_title, cluster_date, confidence_score")
        .in_("cluster_date", dates)
        .execute()
        .data
    )


def _load_cluster_media(sb, cluster_ids: list[int]) -> dict[int, list[dict]]:
    """cluster_id → [{ media_company_id, name, is_our_company }] 매핑."""
    if not cluster_ids:
        return {}
    rows = (
        sb.table("issue_cluster_article")
        .select(
            "issue_cluster_id, "
            "article:article_id(media_company:media_company_id(media_company_id, name, is_our_company))"
        )
        .in_("issue_cluster_id", cluster_ids)
        .execute()
        .data
    )
    result: dict[int, list[dict]] = {}
    for r in rows:
        cid = r["issue_cluster_id"]
        art = r.get("article")
        mc = (art or {}).get("media_company") if isinstance(art, dict) else None
        if mc:
            result.setdefault(cid, []).append(mc)
    return result


def _priority_score(competitor_count: int) -> float:
    # 2개=50(medium) / 3개=75(high) / 4개+=100(high)
    return min(100.0, competitor_count * 25.0)


def _detect(
    clusters: list[dict],
    cluster_media: dict[int, list[dict]],
    our_id: int,
    min_competitors: int,
) -> list[dict]:
    gaps = []
    for c in clusters:
        cid = c["issue_cluster_id"]
        media_list = cluster_media.get(cid, [])

        has_ours = any(m.get("is_our_company") for m in media_list)
        if has_ours:
            continue

        competitor_ids = {m["media_company_id"] for m in media_list if not m.get("is_our_company")}
        if len(competitor_ids) < min_competitors:
            continue

        competitor_names = sorted({m["name"] for m in media_list if not m.get("is_our_company")})
        name_summary = ", ".join(competitor_names[:3]) + ("..." if len(competitor_names) > 3 else "")
        score = _priority_score(len(competitor_ids))
        reason = f"경쟁사 {len(competitor_ids)}개 매체 보도 ({name_summary}), 자사 미보도"

        gaps.append(
            {
                "issue_cluster_id": cid,
                "representative_title": c["representative_title"],
                "confidence_score": c.get("confidence_score") or 0,
                "target_media_company_id": our_id,
                "alert_status": "open",
                "competitor_article_count": len(competitor_ids),
                "priority_score": score,
                "reason": reason,
            }
        )
    return gaps


def _dedup_by_title(gaps: list[dict]) -> list[dict]:
    """동일 representative_title 이 여러 클러스터에서 탐지될 때 confidence 높은 것 하나만 유지."""
    best: dict[str, dict] = {}
    for g in gaps:
        title = g["representative_title"]
        if title not in best or g["confidence_score"] > best[title]["confidence_score"]:
            best[title] = g
    return list(best.values())


def _load_existing_titles(sb, our_id: int) -> set[str]:
    """DB에 이미 open/reviewing 상태인 알림의 representative_title 집합."""
    rows = (
        sb.table("missed_issue_alert")
        .select("issue_cluster_id, alert_status, issue_cluster:issue_cluster_id(representative_title)")
        .eq("target_media_company_id", our_id)
        .in_("alert_status", ["open", "reviewing"])
        .execute()
        .data
    )
    titles = set()
    for r in rows:
        ic = r.get("issue_cluster")
        if isinstance(ic, dict) and ic.get("representative_title"):
            titles.add(ic["representative_title"])
    return titles


def _upsert_alerts(sb, gaps: list[dict], existing_titles: set[str]) -> tuple[int, int]:
    inserted = updated = 0
    for g in gaps:
        existing = (
            sb.table("missed_issue_alert")
            .select("missed_issue_alert_id, alert_status")
            .eq("issue_cluster_id", g["issue_cluster_id"])
            .eq("target_media_company_id", g["target_media_company_id"])
            .limit(1)
            .execute()
            .data
        )
        title = g["representative_title"]
        if existing:
            ex = existing[0]
            if ex["alert_status"] in ("reviewing", "resolved", "ignored"):
                print(f"  SKIP  cluster {g['issue_cluster_id']} (status={ex['alert_status']})")
                continue
            sb.table("missed_issue_alert").update(
                {
                    "competitor_article_count": g["competitor_article_count"],
                    "priority_score": g["priority_score"],
                    "reason": g["reason"],
                }
            ).eq("missed_issue_alert_id", ex["missed_issue_alert_id"]).execute()
            print(f"  UPDATE cluster {g['issue_cluster_id']} score={g['priority_score']:.0f} '{title}'")
            existing_titles.add(title)
            updated += 1
        elif title in existing_titles:
            # 같은 제목의 다른 클러스터가 이미 알림으로 등록됨 → 중복 삽입 방지
            print(f"  SKIP  cluster {g['issue_cluster_id']} (title duplicate) '{title}'")
        else:
            sb.table("missed_issue_alert").insert(
                {
                    "issue_cluster_id": g["issue_cluster_id"],
                    "target_media_company_id": g["target_media_company_id"],
                    "alert_status": "open",
                    "competitor_article_count": g["competitor_article_count"],
                    "priority_score": g["priority_score"],
                    "reason": g["reason"],
                }
            ).execute()
            print(f"  INSERT cluster {g['issue_cluster_id']} score={g['priority_score']:.0f} '{title}'")
            existing_titles.add(title)
            inserted += 1
    return inserted, updated


def main() -> None:
    parser = argparse.ArgumentParser(description="미보도 탐지 → missed_issue_alert 적재")
    parser.add_argument("--days", type=int, default=1, help="오늘 포함 며칠치 클러스터 검사 (기본 1)")
    parser.add_argument("--min-competitors", type=int, default=2, help="경쟁사 최소 보도 매체 수 (기본 2)")
    parser.add_argument("--dry-run", action="store_true", help="DB 쓰기 없이 결과만 출력")
    args = parser.parse_args()

    sb = get_client()
    our = _load_our_company(sb)
    print(f"자사: {our['name']} (id={our['media_company_id']})")

    dates = [(today_kst() - timedelta(days=i)).isoformat() for i in range(args.days)]
    print(f"검사 날짜: {', '.join(dates)}")

    clusters = _load_clusters(sb, dates)
    print(f"클러스터: {len(clusters)}개")

    if not clusters:
        print("클러스터 없음. 종료.")
        return

    cluster_ids = [c["issue_cluster_id"] for c in clusters]
    cluster_media = _load_cluster_media(sb, cluster_ids)

    gaps_raw = _detect(clusters, cluster_media, our["media_company_id"], args.min_competitors)
    gaps = _dedup_by_title(gaps_raw)
    print(f"\n미보도 탐지: {len(gaps)}개 (경쟁사 {args.min_competitors}개 이상, 제목 중복 제거 후)\n")

    if not gaps:
        print("이슈 없음.")
        return

    for g in gaps:
        level = "HIGH" if g["priority_score"] >= 80 else "MED " if g["priority_score"] >= 50 else "LOW "
        print(f"  [{level} {g['priority_score']:.0f}] {g['representative_title']}")
        print(f"         {g['reason']}")

    if args.dry_run:
        print("\n[dry-run] DB 쓰기 생략.")
        return

    existing_titles = _load_existing_titles(sb, our["media_company_id"])
    inserted, updated = _upsert_alerts(sb, gaps, existing_titles)
    print(f"\n완료: {inserted}개 신규 / {updated}개 업데이트.")


if __name__ == "__main__":
    main()
