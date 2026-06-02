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
from scripts.lib.revalidate import revalidate

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
        .select("issue_cluster_id, representative_title, cluster_date, confidence_score, keywords")
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


def _load_our_recent_articles(sb, our_id: int, days: int = 3) -> list[dict]:
    """자사 최근 N일 기사 (article_id, title, url)."""
    cutoff = (datetime.now(KST) - timedelta(days=days)).isoformat()
    return (
        sb.table("article")
        .select("article_id, title, url")
        .eq("media_company_id", our_id)
        .gte("collected_at", cutoff)
        .limit(500)
        .execute()
        .data
    )


# ── 유사도 함수 ────────────────────────────────────────────

def _bigrams(text: str) -> set[str]:
    t = text.strip()
    return {t[i : i + 2] for i in range(len(t) - 1)} if len(t) >= 2 else set()


def _bigram_similarity(a: str, b: str) -> float:
    sa, sb_ = _bigrams(a), _bigrams(b)
    if not sa or not sb_:
        return 0.0
    return len(sa & sb_) / len(sa | sb_)


def _keyword_overlap(keywords: list[str], title: str) -> int:
    title_lower = title.lower()
    return sum(1 for k in keywords if k and k.lower() in title_lower)


def _second_check(
    cluster_title: str,
    keywords: list[str],
    our_articles: list[dict],
) -> tuple[str, dict | None]:
    """
    자사 최근 기사와 유사도 비교 → (verdict, best_match_article)
    - 유사보도있음: 제목 유사도 ≥ 0.4 또는 키워드 2개 이상 겹침
    - 확인필요:    제목 유사도 ≥ 0.15 또는 키워드 1개 이상 겹침
    - 미보도:      그 외
    """
    best_sim = 0.0
    best_kw = 0
    best_article: dict | None = None

    for art in our_articles:
        title = art.get("title") or ""
        sim = _bigram_similarity(cluster_title, title)
        kw = _keyword_overlap(keywords, title)

        if sim > best_sim or (sim == best_sim and kw > best_kw):
            best_sim = sim
            best_kw = kw
            best_article = art

    if best_sim >= 0.4 or best_kw >= 2:
        return "유사보도있음", best_article
    if best_sim >= 0.15 or best_kw >= 1:
        return "확인필요", best_article
    return "미보도", None


# ── 우선순위 ────────────────────────────────────────────────

def _priority_score(competitor_count: int, verdict: str) -> float:
    base = min(100.0, competitor_count * 25.0)
    if verdict == "유사보도있음":
        return 15.0
    if verdict == "확인필요":
        return round(base * 0.6, 1)
    return base  # 미보도


# ── 탐지 ────────────────────────────────────────────────────

def _detect(
    clusters: list[dict],
    cluster_media: dict[int, list[dict]],
    our_id: int,
    min_competitors: int,
    our_articles: list[dict],
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

        keywords: list[str] = c.get("keywords") or []
        verdict, similar_art = _second_check(
            c["representative_title"], keywords, our_articles
        )

        competitor_names = sorted({m["name"] for m in media_list if not m.get("is_our_company")})
        name_summary = ", ".join(competitor_names)
        score = _priority_score(len(competitor_ids), verdict)

        if verdict == "미보도":
            reason = f"경쟁사 {len(competitor_ids)}개 매체 보도 ({name_summary}), 자사 미보도"
        elif similar_art:
            sim = _bigram_similarity(c["representative_title"], similar_art.get("title") or "")
            reason = (
                f"경쟁사 {len(competitor_ids)}개 매체 보도. "
                f"유사 자사 기사: {similar_art['title'][:30]}… (유사도 {sim*100:.0f}%)"
            )
        else:
            reason = f"경쟁사 {len(competitor_ids)}개 매체 보도 ({name_summary})"

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
                "verdict": verdict,
                "similar_article_id": similar_art["article_id"] if similar_art else None,
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
                    "verdict": g["verdict"],
                    "similar_article_id": g["similar_article_id"],
                }
            ).eq("missed_issue_alert_id", ex["missed_issue_alert_id"]).execute()
            print(f"  UPDATE cluster {g['issue_cluster_id']} [{g['verdict']}] score={g['priority_score']:.0f} '{title}'")
            existing_titles.add(title)
            updated += 1
        elif title in existing_titles:
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
                    "verdict": g["verdict"],
                    "similar_article_id": g["similar_article_id"],
                }
            ).execute()
            print(f"  INSERT cluster {g['issue_cluster_id']} [{g['verdict']}] score={g['priority_score']:.0f} '{title}'")
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
    our_articles = _load_our_recent_articles(sb, our["media_company_id"])
    print(f"자사 최근 기사: {len(our_articles)}건 (3일치)")

    gaps_raw = _detect(clusters, cluster_media, our["media_company_id"], args.min_competitors, our_articles)
    gaps = _dedup_by_title(gaps_raw)

    verdict_counts = {"미보도": 0, "확인필요": 0, "유사보도있음": 0}
    for g in gaps:
        verdict_counts[g["verdict"]] = verdict_counts.get(g["verdict"], 0) + 1

    print(
        f"\n탐지: {len(gaps)}개 — "
        f"미보도 {verdict_counts['미보도']} / "
        f"확인필요 {verdict_counts['확인필요']} / "
        f"유사보도있음 {verdict_counts['유사보도있음']}\n"
    )

    if not gaps:
        print("이슈 없음.")
        return

    for g in gaps:
        level = "HIGH" if g["priority_score"] >= 80 else "MED " if g["priority_score"] >= 50 else "LOW "
        print(f"  [{level} {g['priority_score']:.0f}][{g['verdict']}] {g['representative_title']}")
        print(f"         {g['reason']}")

    if args.dry_run:
        print("\n[dry-run] DB 쓰기 생략.")
        return

    existing_titles = _load_existing_titles(sb, our["media_company_id"])
    inserted, updated = _upsert_alerts(sb, gaps, existing_titles)
    print(f"\n완료: {inserted}개 신규 / {updated}개 업데이트.")
    revalidate("dashboard")


if __name__ == "__main__":
    main()
