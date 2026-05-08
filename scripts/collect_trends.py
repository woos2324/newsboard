"""Google Trends RSS 수집 → trending_keyword 적재 + issue_cluster 매칭.

사용:
  python -m scripts.collect_trends
  python -m scripts.collect_trends --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from xml.etree import ElementTree

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

import httpx

from api.lib.ai import chat_completion
from scripts.lib.db import get_client

TRENDS_RSS_URL = "https://trends.google.com/trending/rss?geo=KR"
HT_NS = "https://trends.google.com/trending/rss"

TRAFFIC_ORDER = {"100+": 1, "1K+": 2, "10K+": 3, "100K+": 4, "1M+": 5}


# ---------------------------------------------------------------------------
# RSS 파싱
# ---------------------------------------------------------------------------

def _fetch_rss() -> str:
    resp = httpx.get(TRENDS_RSS_URL, timeout=20, follow_redirects=True)
    resp.raise_for_status()
    return resp.text


def _parse_rss(xml_text: str) -> list[dict]:
    root = ElementTree.fromstring(xml_text)
    channel = root.find("channel")
    if channel is None:
        return []

    results = []
    for rank, item in enumerate(channel.findall("item"), start=1):
        keyword = (item.findtext("title") or "").strip()
        traffic = (item.findtext(f"{{{HT_NS}}}approx_traffic") or "100+").strip()

        news_items = []
        for ni in item.findall(f"{{{HT_NS}}}news_item"):
            title = ni.findtext(f"{{{HT_NS}}}news_item_title") or ""
            url = ni.findtext(f"{{{HT_NS}}}news_item_url") or ""
            source = ni.findtext(f"{{{HT_NS}}}news_item_source") or ""
            if title:
                news_items.append({"title": title, "url": url, "source": source})

        results.append({
            "keyword": keyword,
            "approx_traffic": traffic,
            "traffic_rank": rank,
            "related_news": news_items,
        })

    return results


# ---------------------------------------------------------------------------
# 클러스터 키워드 매칭
# ---------------------------------------------------------------------------

def _bigrams(text: str) -> set[str]:
    tokens = re.findall(r"[가-힣a-zA-Z0-9]+", text)
    merged = "".join(tokens)
    return {merged[i:i+2] for i in range(len(merged) - 1)}


def _match_cluster(keyword: str, clusters: list[dict]) -> int | None:
    kw_bigrams = _bigrams(keyword)
    best_id = None
    best_score = 0.0

    for c in clusters:
        title = c.get("representative_title") or ""
        cluster_kws = c.get("keywords") or []

        # 클러스터 키워드 직접 포함 여부
        for ckw in cluster_kws:
            if keyword in ckw or ckw in keyword:
                return c["issue_cluster_id"]

        # 바이그램 유사도
        title_bigrams = _bigrams(title)
        if not kw_bigrams or not title_bigrams:
            continue
        intersection = kw_bigrams & title_bigrams
        union = kw_bigrams | title_bigrams
        score = len(intersection) / len(union)
        if score > best_score:
            best_score = score
            best_id = c["issue_cluster_id"]

    return best_id if best_score >= 0.2 else None


def _load_recent_clusters(sb) -> list[dict]:
    from datetime import date, timedelta
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    return (
        sb.table("issue_cluster")
        .select("issue_cluster_id, representative_title, keywords")
        .in_("cluster_date", [today, yesterday])
        .execute()
        .data
    ) or []


# ---------------------------------------------------------------------------
# AI 콘텐츠 생성 (요약 + 제목 추천)
# ---------------------------------------------------------------------------

async def _generate_trend_content(keyword: str, related_news: list[dict]) -> dict:
    """키워드 + 관련뉴스 → {summary, title_suggestions}. 한 번의 AI 호출로 생성."""
    titles = [n["title"] for n in related_news if n.get("title")]
    if not titles:
        return {"summary": "", "title_suggestions": []}
    news_text = "\n".join(f"- {t}" for t in titles[:5])
    system = "당신은 뉴스 편집 어시스턴트다. 출력은 항상 JSON 객체 하나로만 반환한다."
    user = (
        f"'{keyword}' 키워드 관련 뉴스 제목들:\n{news_text}\n\n"
        "아래 JSON 형식으로 반환하라.\n"
        '{"summary": "이 키워드가 왜 급상승 중인지 2문장 한국어 요약", '
        '"title_suggestions": ["검색 최적화된 기사 제목 후보1", "후보2", "후보3"]}\n'
        "규칙:\n"
        "- summary: 2문장 이내\n"
        "- title_suggestions: 2~3개, 각 30자 이내, SEO에 강한 한국어 제목\n"
        "- JSON 외 텍스트/마크다운 금지"
    )
    try:
        content, _ = await chat_completion(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.3,
            response_format_json=True,
        )
        result = json.loads(content)
        return {
            "summary": (result.get("summary") or "").strip(),
            "title_suggestions": result.get("title_suggestions") or [],
        }
    except Exception as e:
        print(f"  [경고] AI 콘텐츠 생성 실패 ({keyword}): {e}")
        return {"summary": "", "title_suggestions": []}


# ---------------------------------------------------------------------------
# 저장
# ---------------------------------------------------------------------------

def _save(sb, trends: list[dict], dry_run: bool) -> None:
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "keyword": t["keyword"],
            "approx_traffic": t["approx_traffic"],
            "traffic_rank": t["traffic_rank"],
            "matched_cluster_id": t.get("matched_cluster_id"),
            "related_news": t["related_news"],
            "ai_summary": t.get("ai_summary") or None,
            "title_suggestions": t.get("title_suggestions") or None,
            "fetched_at": now,
        }
        for t in trends
    ]

    if dry_run:
        print(f"[dry-run] {len(rows)}건 저장 생략")
        for r in rows:
            matched = r["matched_cluster_id"]
            print(f"  [{r['traffic_rank']:2d}] {r['keyword']:<20} {r['approx_traffic']:<6} {'→ cluster ' + str(matched) if matched else '(미매칭)'}")
        return

    sb.table("trending_keyword").insert(rows).execute()
    print(f"trending_keyword {len(rows)}건 저장 완료")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("Google Trends RSS 수집 중...")
    xml_text = _fetch_rss()
    trends = _parse_rss(xml_text)
    print(f"  {len(trends)}개 키워드 파싱 완료")

    sb = get_client()
    clusters = _load_recent_clusters(sb)
    print(f"  최근 클러스터 {len(clusters)}개 로드")

    matched = 0
    for t in trends:
        cluster_id = _match_cluster(t["keyword"], clusters)
        t["matched_cluster_id"] = cluster_id
        if cluster_id:
            matched += 1

    print(f"  클러스터 매칭: {matched}/{len(trends)}")

    print("  AI 콘텐츠 생성 중...")
    contents = await asyncio.gather(
        *[_generate_trend_content(t["keyword"], t["related_news"]) for t in trends]
    )
    for t, c in zip(trends, contents):
        t["ai_summary"] = c["summary"]
        t["title_suggestions"] = c["title_suggestions"]
    generated = sum(1 for c in contents if c["summary"])
    print(f"  AI 콘텐츠 생성: {generated}/{len(trends)}")

    _save(sb, trends, dry_run=args.dry_run)


if __name__ == "__main__":
    asyncio.run(main())
