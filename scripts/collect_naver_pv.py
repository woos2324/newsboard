"""
네이버 파트너센터 PV 데이터 수집 (JSON API 방식)

Playwright로 로그인 → stealth 쿠키 추출 → 4개 JSON API 호출 → Supabase 적재

4개 데이터:
  - 기사 조회수 순위 (Top 100)     /api/rank/article/cv
  - 시간대별 조회수 (24시간)        /api/userV2/time
  - 유입분석 (카테고리별 유입)      /api/user/referer
  - 유입키워드 (Top 100 검색어)     /api/search/keywordTotal

실행:
  python -m scripts.collect_naver_pv                   # 어제 데이터 (KST 기준)
  python -m scripts.collect_naver_pv --date 20260518   # 특정 날짜
  python -m scripts.collect_naver_pv --dry-run         # DB 적재 생략
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

from scripts.lib.db import get_client
from scripts.lib.naver_pv_json_parser import (
    parse_article_pv_json,
    parse_hourly_pv_json,
    parse_search_keyword_json,
    parse_traffic_source_json,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = PROJECT_ROOT / ".env.local"
if ENV_PATH.exists():
    load_dotenv(ENV_PATH, override=False)

KST = timezone(timedelta(hours=9))

API_BASE = "https://news-stat-admin.navercorp.com"
API_ENDPOINTS = {
    "article_pv":     f"{API_BASE}/api/rank/article/cv",
    "hourly_pv":      f"{API_BASE}/api/userV2/time",
    "traffic_source": f"{API_BASE}/api/user/referer",
    "search_keyword": f"{API_BASE}/api/search/keywordTotal",
}

LOGIN_URL = "https://friend.navercorp.com/login/loginForm.sec"
NEWS_STAND_URL = (
    "https://pub-iims.navercorp.com/view/svc/main"
    "?svcId=STD&lz=ko_KR&tz=Asia%2FSeoul%3A%2B09%3A00"
)

COOKIE_EXPIRE_DAYS = 14  # 쿠키 유효기간 (2주)

STEALTH_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'plugins',   { get: () => [1, 2, 3, 4, 5] });
Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
window.chrome = { runtime: {} };
const _origQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
if (_origQuery) {
    window.navigator.permissions.query = (p) =>
        p.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : _origQuery(p);
}
"""

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": f"{API_BASE}/",
}


# ───────────────────────── 쿠키 캐시 ─────────────────────────

def _load_cookies() -> dict[str, str] | None:
    """Supabase naver_session에서 쿠키 로드. 없거나 만료됐으면 None."""
    try:
        rows = (
            get_client()
            .table("naver_session")
            .select("cookies_json,expires_at")
            .eq("id", 1)
            .execute()
            .data
        )
        if not rows:
            return None
        row = rows[0]
        exp_str = row.get("expires_at", "")
        if exp_str:
            exp = datetime.fromisoformat(exp_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) >= exp:
                print("  저장된 쿠키 만료됨")
                return None
        cookies = json.loads(row["cookies_json"])
        print(f"  저장된 쿠키 재사용 ({len(cookies)}개)")
        return cookies
    except Exception as e:
        print(f"  쿠키 로드 실패: {e}")
        return None


def _save_cookies(cookies: dict[str, str]) -> None:
    """쿠키를 Supabase naver_session에 저장 (UPSERT)."""
    expires_at = (
        datetime.now(timezone.utc) + timedelta(days=COOKIE_EXPIRE_DAYS)
    ).isoformat()
    get_client().table("naver_session").upsert({
        "id": 1,
        "cookies_json": json.dumps(cookies),
        "expires_at": expires_at,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    print(f"  쿠키 저장 완료 ({COOKIE_EXPIRE_DAYS}일 후 만료)")


# ───────────────────────── 로그인 + API 호출 ─────────────────────────

def _playwright_login() -> dict[str, str]:
    """Playwright stealth 로그인 → {name: value} 쿠키 반환."""
    naver_id = os.environ.get("NAVER_PARTNER_ID")
    naver_pw = os.environ.get("NAVER_PARTNER_PW")
    if not naver_id or not naver_pw:
        raise RuntimeError("NAVER_PARTNER_ID / NAVER_PARTNER_PW 환경변수 필요")

    from playwright.sync_api import sync_playwright

    headless = os.environ.get("HEADLESS", "1") != "0"
    print(f"  로그인 (headless={headless})...")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        ctx = browser.new_context(
            user_agent=HEADERS["User-Agent"],
            locale="ko-KR",
            viewport={"width": 1366, "height": 900},
        )
        ctx.add_init_script(STEALTH_SCRIPT)
        page = ctx.new_page()

        page.goto(LOGIN_URL, wait_until="networkidle")
        page.click("#user_id")
        page.keyboard.type(naver_id, delay=80)
        page.click("#user_pw")
        page.keyboard.type(naver_pw, delay=80)
        page.wait_for_timeout(300)
        page.click("#btn-login")
        page.wait_for_load_state("networkidle")

        if "loginForm" in page.url:
            raise RuntimeError(f"로그인 실패. URL: {page.url}")

        page.goto(NEWS_STAND_URL, wait_until="networkidle")
        try:
            page.goto(f"{API_BASE}/", wait_until="networkidle", timeout=15000)
        except Exception:
            pass

        all_cookies = ctx.cookies()
        cookie_jar = {
            c["name"]: c["value"]
            for c in all_cookies
            if "navercorp.com" in c["domain"]
        }
        browser.close()

    if not cookie_jar:
        raise RuntimeError("쿠키 추출 실패")
    print(f"  로그인 완료 (쿠키 {len(cookie_jar)}개 확보)")
    return cookie_jar


def _call_apis(cookies: dict[str, str], data_date: date) -> dict[str, dict]:
    """저장된 쿠키로 4개 API GET 호출."""
    params = {
        "timeDimension": "DATE",
        "startDate": data_date.isoformat(),
        "section": "total",
        "device": "TOTAL",
        "channelMainTabType": "ALL",
    }
    results: dict[str, dict] = {}
    with httpx.Client(timeout=30) as client:
        for key, url in API_ENDPOINTS.items():
            resp = client.get(url, params=params, headers=HEADERS, cookies=cookies)
            resp.raise_for_status()
            payload = resp.json()
            if payload.get("statusCode") != 200:
                raise RuntimeError(f"{key} API 오류: {payload.get('message')}")
            results[key] = payload
    return results


def fetch_all_json(data_date: date) -> dict[str, dict]:
    """쿠키 재사용 → API 호출. 쿠키 없거나 만료 시 자동 재로그인 + 저장."""
    cookies = _load_cookies()

    if not cookies:
        cookies = _playwright_login()
        _save_cookies(cookies)

    try:
        return _call_apis(cookies, data_date)
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (401, 403):
            # API 호출 중 쿠키 만료 감지 → 즉시 재로그인
            print(f"  쿠키 만료 감지 (HTTP {e.response.status_code}) → 재로그인")
            cookies = _playwright_login()
            _save_cookies(cookies)
            return _call_apis(cookies, data_date)
        raise


# ───────────────────────── article 매칭 ─────────────────────────

def load_article_aid_map() -> dict[str, int]:
    """자사(naver_media_id=022) 기사 전체의 {aid: article_id} 매핑 로드.

    URL 형태: https://n.news.naver.com/mnews/article/022/0004128805
    - published_at=NULL 기사도 포함되어야 하므로 날짜 필터 제거
    - Supabase 기본 1000건 제한이 있으므로 페이지네이션 처리
    """
    sb = get_client()
    mapping: dict[str, int] = {}
    offset, batch = 0, 1000
    while True:
        rows = (
            sb.table("article")
            .select("article_id,url")
            .like("url", "%/022/%")   # 세계일보 URL 패턴
            .range(offset, offset + batch - 1)
            .execute()
            .data
        )
        for r in rows:
            url = r.get("url", "")
            m = re.search(r"/(\d{7,12})(?:[/?]|$)", url)
            if m:
                mapping[m.group(1)] = r["article_id"]
        if len(rows) < batch:
            break
        offset += batch
    return mapping


# ───────────────────────── DB upsert ─────────────────────────

def upsert_article_pv(items: list, aid_map: dict[str, int], dry_run: bool) -> int:
    rows = []
    for it in items:
        article_id = aid_map.get(it.article_aid)
        rows.append({
            "data_date": it.data_date.isoformat(),
            "rank": it.rank,
            "title": it.title,
            "reporter_name": it.reporter_name,
            "article_published_at": it.article_published_at.isoformat(),
            "pv": it.pv,
            "device": "all",
            "category": "all",
            "article_url": it.article_url,
            "article_id": article_id,
        })
    if dry_run:
        matched = sum(1 for r in rows if r["article_id"])
        print(f"     [dry-run] article_pv_snapshot: {len(rows)}건 (article 매칭 {matched}건) skipped")
        return len(rows)
    get_client().table("article_pv_snapshot").upsert(
        rows, on_conflict="data_date,rank,device,category"
    ).execute()
    return len(rows)


def upsert_hourly_pv(items: list, dry_run: bool) -> int:
    rows = [
        {
            "data_date": it.data_date.isoformat(),
            "hour": it.hour,
            "pv": it.pv,
            "device": "all",
            "category": "all",
        }
        for it in items
    ]
    if dry_run:
        print(f"     [dry-run] hourly_pv_snapshot: {len(rows)}건 skipped")
        return len(rows)
    get_client().table("hourly_pv_snapshot").upsert(
        rows, on_conflict="data_date,hour,device,category"
    ).execute()
    return len(rows)


def insert_traffic_source(items: list, dry_run: bool) -> int:
    if not items:
        return 0
    data_date = items[0].data_date.isoformat()
    rows = [
        {
            "data_date": data_date,
            "source_category": it.source_category,
            "source_detail_url": None,
            "category_ratio": it.pv_ratio,
            "detail_ratio": it.pv_ratio,
        }
        for it in items
    ]
    if dry_run:
        print(f"     [dry-run] traffic_source_daily: {len(rows)}건 skipped")
        return len(rows)
    sb = get_client()
    sb.table("traffic_source_daily").delete().eq("data_date", data_date).execute()
    sb.table("traffic_source_daily").insert(rows).execute()
    return len(rows)


def upsert_search_keyword(items: list, dry_run: bool) -> int:
    rows = [
        {
            "data_date": it.data_date.isoformat(),
            "rank": it.rank,
            "keyword": it.keyword,
            "clicks": it.clicks,
            "ratio": it.click_ratio,
        }
        for it in items
    ]
    if dry_run:
        print(f"     [dry-run] search_keyword_daily: {len(rows)}건 skipped")
        return len(rows)
    get_client().table("search_keyword_daily").upsert(
        rows, on_conflict="data_date,keyword"
    ).execute()
    return len(rows)


# ───────────────────────── 메인 ─────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="YYYYMMDD. 기본: 어제(KST)")
    ap.add_argument("--dry-run", action="store_true", help="DB 적재 생략")
    args = ap.parse_args()

    if args.date:
        data_date = datetime.strptime(args.date, "%Y%m%d").date()
    else:
        data_date = (datetime.now(KST) - timedelta(days=1)).date()

    print(f"[수집 시작] data_date={data_date}  dry_run={args.dry_run}")

    # 1. JSON API 호출
    print("[1/3] 네이버 로그인 + JSON API 호출...")
    payloads = fetch_all_json(data_date)
    print("  [OK] 4개 API 완료")

    # 2. 파싱
    print("[2/3] 파싱...")
    article_rows    = parse_article_pv_json(payloads["article_pv"])
    hourly_rows     = parse_hourly_pv_json(payloads["hourly_pv"], data_date)
    traffic_rows    = parse_traffic_source_json(payloads["traffic_source"])
    keyword_rows    = parse_search_keyword_json(payloads["search_keyword"])

    print(f"  기사 PV: {len(article_rows)}건")
    print(f"  시간대별: {len(hourly_rows)}건")
    print(f"  유입분석: {len(traffic_rows)}건")
    print(f"  유입키워드: {len(keyword_rows)}건")

    # 3. DB 적재
    print("[3/3] DB 적재...")
    aid_map = {} if args.dry_run else load_article_aid_map()

    n1 = upsert_article_pv(article_rows, aid_map, args.dry_run)
    n2 = upsert_hourly_pv(hourly_rows, args.dry_run)
    n3 = insert_traffic_source(traffic_rows, args.dry_run)
    n4 = upsert_search_keyword(keyword_rows, args.dry_run)

    total = n1 + n2 + n3 + n4
    print(f"\n완료: {total}건 적재")
    return 0


if __name__ == "__main__":
    sys.exit(main())
