"""Google Trends DOM 수집 → trending_keyword 적재 + issue_cluster 매칭.

수집원: https://trends.google.com/trending?geo=KR&hl=ko&hours=4&status=active (Playwright)
주기: 3분마다 (crontab */3)

사용:
  python -m scripts.collect_trends
  python -m scripts.collect_trends --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Optional

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

from api.lib.ai import chat_completion
from scripts.lib.db import get_client

TRENDS_URL = "https://trends.google.com/trending?geo=KR&hl=ko&hours=24&status=active"

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

_STEALTH_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
Object.defineProperty(navigator, 'languages', {get: () => ['ko-KR', 'ko', 'en-US']});
Object.defineProperty(navigator, 'platform', {get: () => 'Win32'});
window.chrome = {runtime: {}, loadTimes: function(){}, csi: function(){}, app: {}};
"""

# 머티리얼 아이콘 텍스트 토큰 (inner_text에 섞여 나오는 것들)
_ICON_TOKENS = re.compile(
    r"\b(arrow_upward|arrow_downward|trending_up|trending_down|trending_flat"
    r"|more_vert|checklist|query_stats|check_box|check_box_outline_blank"
    r"|추가 작업|선택|탐색|검색)\b"
)


# ---------------------------------------------------------------------------
# 파싱 유틸
# ---------------------------------------------------------------------------

def _clean(text: str) -> str:
    """아이콘 토큰 제거 + 공백 정리."""
    return _ICON_TOKENS.sub("", text).strip()


def _parse_search_volume(text: str) -> tuple[str, Optional[int]]:
    """'5천+', '1천+', '500+', '2만+' → (원문, 정수).
    반환: (approx_traffic, search_volume)
    """
    t = text.strip()
    approx = t  # 원문 보존
    # 숫자 + 단위 추출
    m = re.search(r"([\d,]+)\s*(천|만)?", t)
    if not m:
        return approx, None
    num = int(m.group(1).replace(",", ""))
    unit = m.group(2) or ""
    if unit == "천":
        num *= 1000
    elif unit == "만":
        num *= 10000
    return approx, num


def _parse_growth_rate(text: str) -> Optional[int]:
    """'1,000%' → 1000, '900%' → 900. 없으면 None."""
    m = re.search(r"([\d,]+)%", text)
    if not m:
        return None
    return int(m.group(1).replace(",", ""))


def _parse_started(text: str, now: datetime) -> tuple[str, Optional[datetime]]:
    """'3시간 전' → (원문, datetime). '방금' → now."""
    t = text.strip()
    # 시간
    m = re.search(r"(\d+)\s*시간\s*전", t)
    if m:
        return t, now - timedelta(hours=int(m.group(1)))
    # 분
    m = re.search(r"(\d+)\s*분\s*전", t)
    if m:
        return t, now - timedelta(minutes=int(m.group(1)))
    # 방금
    if "방금" in t or t.endswith("전") and "시간" not in t and "분" not in t:
        return t, now
    return t, None


def _parse_related_queries(text: str) -> list[str]:
    """td[4] inner_text → 관련 검색어 목록."""
    parts = re.split(r"[\n|]", text)
    result = []
    for p in parts:
        p = _clean(p).strip()
        if p:
            result.append(p)
    return result


def _parse_news_link(el_text: str, el_href: str) -> Optional[dict]:
    """'제목 N시간 전 ● 출처' → dict."""
    href = el_href or ""
    if not href.startswith("http") or "google" in href:
        return None
    text = el_text.strip().replace("\xa0", " ")
    # 출처: ● 뒤
    source = ""
    m = re.search(r"●\s*(.+)$", text)
    if m:
        source = m.group(1).strip()
        text = text[: m.start()].strip()
    # 시각: N시간 전 / N분 전 패턴
    published_ago = ""
    m2 = re.search(r"(\d+\s*(?:시간|분)\s*전)", text)
    if m2:
        published_ago = m2.group(1)
        text = text[: m2.start()].strip()
    # 제목 끝 ' - 매체명' 제거
    title = re.sub(r"\s*-\s*\S+$", "", text).strip()
    return {"title": title, "url": href, "source": source, "published_ago": published_ago}


# ---------------------------------------------------------------------------
# DOM 수집 (sync Playwright → executor에서 실행)
# ---------------------------------------------------------------------------

def _fetch_trends_dom() -> list[dict]:
    """Playwright로 trends 페이지 파싱. 동기 함수."""
    from playwright.sync_api import sync_playwright

    headless = os.environ.get("HEADLESS", "1") != "0"
    now = datetime.now(timezone.utc)
    results: list[dict] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        ctx = browser.new_context(locale="ko-KR", user_agent=_UA)
        ctx.add_init_script(_STEALTH_SCRIPT)
        page = ctx.new_page()

        page.goto(TRENDS_URL, wait_until="domcontentloaded", timeout=60000)
        try:
            page.wait_for_selector("table tbody tr", timeout=30000)
        except Exception:
            print("  [경고] table 셀렉터 타임아웃 — 행 0개로 처리")
            browser.close()
            return []
        page.wait_for_timeout(2500)

        rows = page.query_selector_all("table tbody tr")
        data_rows = [r for r in rows if len(r.query_selector_all("td")) >= 7]
        print(f"  데이터 행: {len(data_rows)}개")

        # 1단계: 클릭 없이 기본 필드 파싱
        for rank, row in enumerate(data_rows, start=1):
            cells = row.query_selector_all("td")
            keyword = _clean(cells[1].inner_text() or "")
            if not keyword:
                continue

            raw2 = cells[2].inner_text() or ""
            raw3 = cells[3].inner_text() or ""
            raw4 = cells[4].inner_text() if len(cells) > 4 else ""

            # td[2]: 검색량 + 증가율
            parts2 = [_clean(p) for p in re.split(r"[\n|]", raw2) if _clean(p)]
            approx_traffic = ""
            search_volume = None
            growth_rate = None
            for p in parts2:
                if re.search(r"[\d,]+(천|만)?\+?", p) and ("%" not in p):
                    approx_traffic, search_volume = _parse_search_volume(p)
                elif "%" in p:
                    growth_rate = _parse_growth_rate(p)

            # td[3]: 시작시각 + 상태
            parts3 = [_clean(p) for p in re.split(r"[\n|]", raw3) if _clean(p)]
            started_ago_text = ""
            started_at = None
            status = ""
            for p in parts3:
                if "전" in p or "방금" in p:
                    started_ago_text, started_at = _parse_started(p, now)
                elif p:
                    status = p  # 마지막 한글 토큰 = 상태

            # td[4]: 관련 검색어
            related_queries = _parse_related_queries(raw4)

            results.append({
                "keyword": keyword,
                "approx_traffic": approx_traffic or "100+",
                "search_volume": search_volume,
                "growth_rate": growth_rate,
                "traffic_rank": rank,
                "started_ago_text": started_ago_text,
                "started_at": started_at,
                "status": status,
                "related_queries": related_queries,
                "related_news": [],
                "_row_idx": rank - 1,
            })

        # 2단계: 행 클릭으로 관련 뉴스 수집
        print(f"  관련 뉴스 수집 중 ({len(results)}건 순회)...")
        for item in results:
            try:
                # 현재 rows 목록 재참조 (DOM이 살아있음)
                row = data_rows[item["_row_idx"]]
                row.click()
                page.wait_for_timeout(1800)

                news = []
                for link in page.query_selector_all("a"):
                    href = link.get_attribute("href") or ""
                    if not href.startswith("http") or "google" in href:
                        continue
                    t = (link.inner_text() or "").strip()
                    if "●" not in t:
                        continue
                    parsed = _parse_news_link(t, href)
                    if parsed and parsed["title"]:
                        news.append(parsed)

                item["related_news"] = news[:3]
            except Exception as e:
                print(f"  [경고] {item['keyword']} 뉴스 수집 실패: {e}")

        browser.close()

    # 임시 키 제거
    for item in results:
        item.pop("_row_idx", None)

    return results


# ---------------------------------------------------------------------------
# 클러스터 키워드 매칭 (기존 로직 유지)
# ---------------------------------------------------------------------------

def _bigrams(text: str) -> set[str]:
    tokens = re.findall(r"[가-힣a-zA-Z0-9]+", text)
    merged = "".join(tokens)
    return {merged[i:i+2] for i in range(len(merged) - 1)}


def _match_cluster(keyword: str, related_news: list[dict], clusters: list[dict]) -> Optional[int]:
    kw_lower = keyword.lower()
    kw_bigrams = _bigrams(keyword)
    news_bigrams = [_bigrams(n["title"]) for n in related_news[:3] if n.get("title")]

    best_id = None
    best_score = 0.0

    for c in clusters:
        title = c.get("representative_title") or ""
        cluster_kws = c.get("keywords") or []
        title_bigrams = _bigrams(title)
        score = 0.0

        for ckw in cluster_kws:
            ckw_lower = ckw.lower()
            if kw_lower == ckw_lower:
                score += 1.0
            elif kw_lower in ckw_lower or ckw_lower in kw_lower:
                score += 0.4

        if kw_bigrams and title_bigrams:
            inter = kw_bigrams & title_bigrams
            uni = kw_bigrams | title_bigrams
            score += len(inter) / len(uni)

        if news_bigrams and title_bigrams:
            max_sim = max(
                len(nb & title_bigrams) / len(nb | title_bigrams)
                for nb in news_bigrams
                if nb | title_bigrams
            )
            score += max_sim * 1.5

        if score > best_score:
            best_score = score
            best_id = c["issue_cluster_id"]

    return best_id if best_score >= 0.5 else None


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
# AI 콘텐츠 캐시 + 생성 (기존 로직 유지)
# ---------------------------------------------------------------------------

def _load_recent_ai_content(sb, keywords: list[str]) -> dict[str, str]:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    result = (
        sb.table("trending_keyword")
        .select("keyword, ai_summary")
        .in_("keyword", keywords)
        .gte("fetched_at", cutoff)
        .not_.is_("ai_summary", "null")
        .order("fetched_at", desc=True)
        .execute()
    )
    seen: dict[str, str] = {}
    for row in (result.data or []):
        kw = row["keyword"]
        if kw not in seen:
            seen[kw] = row["ai_summary"] or ""
    return seen


async def _generate_trend_content(keyword: str, related_news: list[dict], related_queries: list[str]) -> str:
    titles = [n["title"] for n in related_news if n.get("title")]
    if not titles and not related_queries:
        return ""

    news_text = "\n".join(f"- {t}" for t in titles[:5])
    queries_text = " / ".join(related_queries[:5]) if related_queries else ""

    system = "당신은 뉴스 편집 어시스턴트다. 출력은 항상 JSON 객체 하나로만 반환한다."
    user = (
        f"'{keyword}' 키워드 관련 정보:\n"
        + (f"관련 뉴스:\n{news_text}\n" if news_text else "")
        + (f"관련 검색어: {queries_text}\n" if queries_text else "")
        + "\n아래 JSON 형식으로 반환하라.\n"
        '{"summary": "이 키워드가 왜 급상승 중인지 2문장 한국어 요약"}\n'
        "규칙:\n"
        "- summary: 2문장 이내\n"
        "- JSON 외 텍스트/마크다운 금지"
    )
    try:
        content, _ = await chat_completion(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.3,
            response_format_json=True,
        )
        result = json.loads(content)
        await asyncio.sleep(1)
        return (result.get("summary") or "").strip()
    except Exception as e:
        print(f"  [경고] AI 콘텐츠 생성 실패 ({keyword}): {e}")
        return ""


# ---------------------------------------------------------------------------
# 저장
# ---------------------------------------------------------------------------

def _save(sb, trends: list[dict], dry_run: bool) -> None:
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "keyword": t["keyword"],
            "approx_traffic": t["approx_traffic"],
            "search_volume": t.get("search_volume"),
            "growth_rate": t.get("growth_rate"),
            "traffic_rank": t["traffic_rank"],
            "started_at": t["started_at"].isoformat() if t.get("started_at") else None,
            "started_ago_text": t.get("started_ago_text") or None,
            "status": t.get("status") or None,
            "related_queries": t.get("related_queries") or None,
            "matched_cluster_id": t.get("matched_cluster_id"),
            "related_news": t["related_news"],
            "ai_summary": t.get("ai_summary") or None,
            "fetched_at": now,
        }
        for t in trends
    ]

    if dry_run:
        print(f"[dry-run] {len(rows)}건 저장 생략")
        for r in rows:
            matched = r["matched_cluster_id"]
            news_cnt = len(r["related_news"])
            queries = r["related_queries"] or []
            print(
                f"  [{r['traffic_rank']:2d}] {r['keyword']:<16}"
                f" {r['approx_traffic']:<6} ↑{r['growth_rate'] or '?'}%"
                f" {r['started_ago_text'] or '-':<8}"
                f" 뉴스{news_cnt}건 관련검색{len(queries)}건"
                f" {'→ cluster ' + str(matched) if matched else ''}"
            )
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

    print("Google Trends DOM 수집 중...")
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=1) as executor:
        trends = await loop.run_in_executor(executor, _fetch_trends_dom)

    if not trends:
        print("수집된 트렌드 없음 — 종료")
        return
    print(f"  {len(trends)}개 키워드 파싱 완료")

    sb = get_client()
    clusters = _load_recent_clusters(sb)
    print(f"  최근 클러스터 {len(clusters)}개 로드")

    matched = 0
    for t in trends:
        cluster_id = _match_cluster(t["keyword"], t["related_news"], clusters)
        t["matched_cluster_id"] = cluster_id
        if cluster_id:
            matched += 1
    print(f"  클러스터 매칭: {matched}/{len(trends)}")

    print("  AI 콘텐츠 생성 중...")
    cached = _load_recent_ai_content(sb, [t["keyword"] for t in trends])
    to_generate = [t for t in trends if t["keyword"] not in cached]
    print(f"  캐시 재사용: {len(cached)}건 / 신규 생성: {len(to_generate)}건")

    if to_generate:
        summaries = await asyncio.gather(
            *[
                _generate_trend_content(t["keyword"], t["related_news"], t.get("related_queries") or [])
                for t in to_generate
            ]
        )
        for t, summary in zip(to_generate, summaries):
            t["ai_summary"] = summary

    for t in trends:
        if t["keyword"] in cached:
            t["ai_summary"] = cached[t["keyword"]]

    generated = sum(1 for t in trends if t.get("ai_summary"))
    print(f"  AI 콘텐츠 완료: {generated}/{len(trends)}")

    _save(sb, trends, dry_run=args.dry_run)


if __name__ == "__main__":
    asyncio.run(main())
