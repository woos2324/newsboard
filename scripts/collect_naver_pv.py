"""
네이버 파트너센터 PV 데이터 수집 (확장판)

수집 조합:
  - device   : TOTAL / PC / MOBILE
  - section  : total / 정치 / 경제 / 사회 / IT / 생활 / 세계 / 엔터 / 스포츠 / 기타
  - timeDim  : daily(DATE) / weekly(WEEK, 매주 화요일) / monthly(MONTH, 매월 2일)

저장 테이블:
  - article_pv_snapshot  : 기사 순위 Top 100  (device × section × time_dimension)
  - hourly_pv_snapshot   : 시간대별 조회수     (device, daily only)
  - daily_cv_snapshot    : 섹션별 실제 총 PV  (device × section × time_dimension, /api/visitV2/cv)
  - traffic_source_daily : 유입 경로          (TOTAL only, unchanged)
  - search_keyword_daily : 검색 키워드        (unchanged)

실행:
  python -m scripts.collect_naver_pv
  python -m scripts.collect_naver_pv --date 20260519
  python -m scripts.collect_naver_pv --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
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
    parse_daily_cv_all_devices,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = PROJECT_ROOT / ".env.local"
if ENV_PATH.exists():
    load_dotenv(ENV_PATH, override=False)

# stdout/stderr UTF-8 강제 (Windows cp949 크래시 방지)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

KST = timezone(timedelta(hours=9))

API_BASE = "https://news-stat-admin.navercorp.com"

ENDPOINTS = {
    "article_pv":     f"{API_BASE}/api/rank/article/cv",
    "hourly_pv":      f"{API_BASE}/api/userV2/time",
    "daily_cv":       f"{API_BASE}/api/visitV2/cv",
    "traffic_source": f"{API_BASE}/api/user/referer",
    "search_keyword": f"{API_BASE}/api/search/keywordTotal",
}

DEVICES = ["TOTAL", "PC", "MOBILE"]
DEVICE_LABEL = {"TOTAL": "all", "PC": "pc", "MOBILE": "mobile"}

SECTIONS = ["total", "정치", "경제", "사회", "IT", "생활", "세계", "엔터", "스포츠", "기타"]
# "total" 섹션은 DB에 "all"로 저장 (기존 데이터 및 쿼리와 일관성 유지)
SECTION_LABEL = {"total": "all"}

LOGIN_URL   = "https://friend.navercorp.com/login/loginForm.sec"
NEWS_STAND  = "https://pub-iims.navercorp.com/view/svc/main?svcId=STD&lz=ko_KR&tz=Asia%2FSeoul%3A%2B09%3A00"
COOKIE_DAYS = 14
API_DELAY   = 0.5   # 호출 간 딜레이 (초)

STEALTH = """
Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
Object.defineProperty(navigator,'plugins',  {get:()=>[1,2,3,4,5]});
Object.defineProperty(navigator,'languages',{get:()=>['ko-KR','ko','en-US','en']});
window.chrome={runtime:{}};
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
    expires_at = (datetime.now(timezone.utc) + timedelta(days=COOKIE_DAYS)).isoformat()
    get_client().table("naver_session").upsert({
        "id": 1,
        "cookies_json": json.dumps(cookies),
        "expires_at": expires_at,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    print(f"  쿠키 저장 완료 ({COOKIE_DAYS}일 후 만료)")


def _playwright_login() -> dict[str, str]:
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
        ctx.add_init_script(STEALTH)
        page = ctx.new_page()
        page.goto(LOGIN_URL, wait_until="networkidle")
        page.click("#user_id"); page.keyboard.type(naver_id, delay=80)
        page.click("#user_pw"); page.keyboard.type(naver_pw, delay=80)
        page.wait_for_timeout(300)
        page.click("#btn-login")
        page.wait_for_load_state("networkidle")
        if "loginForm" in page.url:
            raise RuntimeError(f"로그인 실패. URL: {page.url}")
        page.goto(NEWS_STAND, wait_until="networkidle")
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


# ───────────────────────── 단일 API 호출 ─────────────────────────

def _call_one(
    client: httpx.Client,
    cookies: dict[str, str],
    endpoint: str,
    data_date: date,
    device: str = "TOTAL",
    section: str = "total",
    time_dim: str = "DATE",
) -> dict:
    params = {
        "timeDimension": time_dim,
        "startDate": data_date.isoformat(),
        "endDate":   data_date.isoformat(),
        "section": section,
        "device": device,
        "channelMainTabType": "ALL",
    }
    resp = client.get(endpoint, params=params, headers=HEADERS, cookies=cookies)
    resp.raise_for_status()
    payload = resp.json()
    if payload.get("statusCode") != 200:
        raise RuntimeError(f"API 오류 ({endpoint}): {payload.get('message')}")
    time.sleep(API_DELAY)
    return payload


def get_cookies_with_refresh(existing: dict[str, str] | None) -> dict[str, str]:
    if existing:
        return existing
    cookies = _playwright_login()
    _save_cookies(cookies)
    return cookies


# ───────────────────────── article_id 매핑 ─────────────────────────

def load_article_aid_map() -> dict[str, int]:
    sb = get_client()
    mapping: dict[str, int] = {}
    offset, batch = 0, 1000
    while True:
        rows = (
            sb.table("article")
            .select("article_id,url")
            .like("url", "%/022/%")
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

def upsert_article_pv(
    items: list,
    aid_map: dict[str, int],
    device_label: str,
    section: str,
    time_dimension: str,
    dry_run: bool,
) -> int:
    rows = []
    for it in items:
        if not it.title:  # title null 행 스킵
            continue
        article_id = aid_map.get(it.article_aid)
        rows.append({
            "data_date": it.data_date.isoformat(),
            "time_dimension": time_dimension,
            "rank": it.rank,
            "title": it.title,
            "reporter_name": it.reporter_name,
            "article_published_at": it.article_published_at.isoformat(),
            "pv": it.pv,
            "device": device_label,
            "category": section,
            "article_url": it.article_url,
            "article_id": article_id,
        })
    if dry_run:
        matched = sum(1 for r in rows if r["article_id"])
        print(f"     [dry-run] article_pv ({device_label}/{section}/{time_dimension}): {len(rows)}건 (매칭 {matched}) skipped")
        return len(rows)
    get_client().table("article_pv_snapshot").upsert(
        rows, on_conflict="data_date,time_dimension,rank,device,category"
    ).execute()
    return len(rows)


def upsert_hourly_pv(items: list, device_label: str, dry_run: bool) -> int:
    rows = [
        {
            "data_date": it.data_date.isoformat(),
            "hour": it.hour,
            "pv": it.pv,
            "device": device_label,
            "category": "all",
        }
        for it in items
    ]
    if dry_run:
        print(f"     [dry-run] hourly_pv ({device_label}): {len(rows)}건 skipped")
        return len(rows)
    get_client().table("hourly_pv_snapshot").upsert(
        rows, on_conflict="data_date,hour,device,category"
    ).execute()
    return len(rows)


def upsert_daily_cv(
    pv: int,
    data_date: date,
    device_label: str,
    section: str,
    time_dimension: str,
    dry_run: bool,
) -> int:
    row = {
        "data_date": data_date.isoformat(),
        "time_dimension": time_dimension,
        "device": device_label,
        "section": section,
        "pv": pv,
    }
    if dry_run:
        print(f"     [dry-run] daily_cv ({device_label}/{section}/{time_dimension}): {pv:,} PV skipped")
        return 1
    get_client().table("daily_cv_snapshot").upsert(
        [row], on_conflict="data_date,time_dimension,device,section"
    ).execute()
    return 1


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
        print(f"     [dry-run] traffic_source: {len(rows)}건 skipped")
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
        print(f"     [dry-run] search_keyword: {len(rows)}건 skipped")
        return len(rows)
    get_client().table("search_keyword_daily").upsert(
        rows, on_conflict="data_date,keyword"
    ).execute()
    return len(rows)


# ───────────────────────── 수집 오케스트레이션 ─────────────────────────

def collect_daily(
    data_date: date,
    cookies: dict[str, str],
    aid_map: dict[str, int],
    dry_run: bool,
) -> tuple[dict[str, str], int]:
    """일간 데이터 수집. (cookies 갱신 가능) → (cookies, 총 rows)"""
    total = 0
    time_dimension = "daily"

    with httpx.Client(timeout=30) as client:

        # ── hourly_pv: device 루프 (section 불필요)
        print(f"  [hourly_pv] device 3개...")
        for dev in DEVICES:
            try:
                payload = _call_one(client, cookies, ENDPOINTS["hourly_pv"],
                                    data_date, device=dev, section="total", time_dim="DATE")
                items = parse_hourly_pv_json(payload, data_date)
                total += upsert_hourly_pv(items, DEVICE_LABEL[dev], dry_run)
            except httpx.HTTPStatusError as e:
                if e.response.status_code in (401, 403):
                    cookies = _playwright_login(); _save_cookies(cookies)
                    payload = _call_one(client, cookies, ENDPOINTS["hourly_pv"],
                                        data_date, device=dev, section="total", time_dim="DATE")
                    items = parse_hourly_pv_json(payload, data_date)
                    total += upsert_hourly_pv(items, DEVICE_LABEL[dev], dry_run)
                else:
                    print(f"    [WARN] hourly_pv {dev}: {e}")

        # ── article_pv: device × section 루프
        # ── daily_cv: section 루프만 (TOTAL 1회 호출로 3개 device 동시 추출)
        combo_count = len(DEVICES) * len(SECTIONS)
        print(f"  [article_pv] {combo_count}개 조합 / [daily_cv] {len(SECTIONS)}개 섹션...")
        for dev in DEVICES:
            for sec in SECTIONS:
                try:
                    payload_a = _call_one(client, cookies, ENDPOINTS["article_pv"],
                                          data_date, device=dev, section=sec, time_dim="DATE")
                    items_a = parse_article_pv_json(payload_a)
                    sec_label = SECTION_LABEL.get(sec, sec)
                    total += upsert_article_pv(items_a, aid_map, DEVICE_LABEL[dev], sec_label, time_dimension, dry_run)
                except httpx.HTTPStatusError as e:
                    if e.response.status_code in (401, 403):
                        cookies = _playwright_login(); _save_cookies(cookies)
                    print(f"    [WARN] article_pv {dev}/{sec}: {e}")
                except Exception as e:
                    print(f"    [WARN] article_pv {dev}/{sec}: {e}")

        for sec in SECTIONS:
            sec_label = SECTION_LABEL.get(sec, sec)
            try:
                # TOTAL 한 번 호출로 all/pc/mobile 동시 추출
                payload_c = _call_one(client, cookies, ENDPOINTS["daily_cv"],
                                      data_date, device="TOTAL", section=sec, time_dim="DATE")
                cv_map = parse_daily_cv_all_devices(payload_c)
                for dev_label, pv in cv_map.items():
                    total += upsert_daily_cv(pv, data_date, dev_label, sec_label, time_dimension, dry_run)
            except httpx.HTTPStatusError as e:
                if e.response.status_code in (401, 403):
                    cookies = _playwright_login(); _save_cookies(cookies)
                print(f"    [WARN] daily_cv {sec}: {e}")
            except Exception as e:
                print(f"    [WARN] daily_cv {sec}: {e}")

        # ── traffic_source (TOTAL/total 고정)
        try:
            payload_t = _call_one(client, cookies, ENDPOINTS["traffic_source"],
                                  data_date, device="TOTAL", section="total", time_dim="DATE")
            items_t = parse_traffic_source_json(payload_t)
            total += insert_traffic_source(items_t, dry_run)
        except Exception as e:
            print(f"    [WARN] traffic_source: {e}")

        # ── search_keyword
        try:
            payload_k = _call_one(client, cookies, ENDPOINTS["search_keyword"],
                                  data_date, device="TOTAL", section="total", time_dim="DATE")
            items_k = parse_search_keyword_json(payload_k)
            total += upsert_search_keyword(items_k, dry_run)
        except Exception as e:
            print(f"    [WARN] search_keyword: {e}")

    return cookies, total


def collect_period(
    start_date: date,
    time_dim_api: str,
    time_dimension: str,
    cookies: dict[str, str],
    aid_map: dict[str, int],
    dry_run: bool,
) -> tuple[dict[str, str], int]:
    """주간/월간 article_pv + daily_cv 수집."""
    total = 0
    combo_count = len(DEVICES) * len(SECTIONS)
    print(f"  [{time_dimension}] {start_date} / {combo_count}개 조합...")

    with httpx.Client(timeout=30) as client:
        for dev in DEVICES:
            for sec in SECTIONS:
                try:
                    payload_a = _call_one(client, cookies, ENDPOINTS["article_pv"],
                                          start_date, device=dev, section=sec, time_dim=time_dim_api)
                    items_a = parse_article_pv_json(payload_a)
                    sec_label = SECTION_LABEL.get(sec, sec)
                    total += upsert_article_pv(items_a, aid_map, DEVICE_LABEL[dev], sec_label, time_dimension, dry_run)
                except httpx.HTTPStatusError as e:
                    if e.response.status_code in (401, 403):
                        cookies = _playwright_login(); _save_cookies(cookies)
                    print(f"    [WARN] article_pv {dev}/{sec}: {e}")
                except Exception as e:
                    print(f"    [WARN] article_pv {dev}/{sec}: {e}")

        for sec in SECTIONS:
            sec_label = SECTION_LABEL.get(sec, sec)
            try:
                payload_c = _call_one(client, cookies, ENDPOINTS["daily_cv"],
                                      start_date, device="TOTAL", section=sec, time_dim=time_dim_api)
                cv_map = parse_daily_cv_all_devices(payload_c)
                for dev_label, pv in cv_map.items():
                    total += upsert_daily_cv(pv, start_date, dev_label, sec_label, time_dimension, dry_run)
            except httpx.HTTPStatusError as e:
                if e.response.status_code in (401, 403):
                    cookies = _playwright_login(); _save_cookies(cookies)
                print(f"    [WARN] daily_cv {sec}: {e}")
            except Exception as e:
                print(f"    [WARN] daily_cv {sec}: {e}")

    return cookies, total


# ───────────────────────── 메인 ─────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="YYYYMMDD. 기본: 어제(KST)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--weekly", action="store_true", help="주간 수집 강제 실행")
    ap.add_argument("--monthly", action="store_true", help="월간 수집 강제 실행")
    args = ap.parse_args()

    kst_today = datetime.now(KST).date()

    if args.date:
        data_date = datetime.strptime(args.date, "%Y%m%d").date()
    else:
        data_date = kst_today - timedelta(days=1)

    print(f"[수집 시작] data_date={data_date}  dry_run={args.dry_run}")

    # 쿠키 로드
    print("[1] 쿠키 로드...")
    cookies = _load_cookies() or {}
    if not cookies:
        cookies = _playwright_login()
        _save_cookies(cookies)

    # article_id 매핑
    if not args.dry_run:
        print("[2] article_id 매핑 로드...")
        aid_map = load_article_aid_map()
        print(f"  {len(aid_map)}건")
    else:
        aid_map = {}

    total = 0

    # ── 일간 수집
    print(f"[3] 일간 수집 ({data_date})...")
    cookies, n = collect_daily(data_date, cookies, aid_map, args.dry_run)
    total += n
    print(f"  일간: {n}건 완료")

    # ── 주간 수집 (매주 화요일 또는 --weekly 플래그)
    run_weekly = args.weekly or (not args.date and kst_today.weekday() == 1)
    if run_weekly:
        # 지난 주 월요일 = 오늘 - 8일 (화요일 기준)
        last_monday = kst_today - timedelta(days=8)
        print(f"[4] 주간 수집 ({last_monday})...")
        cookies, n = collect_period(last_monday, "WEEK", "weekly", cookies, aid_map, args.dry_run)
        total += n
        print(f"  주간: {n}건 완료")

    # ── 월간 수집 (매월 2일 또는 --monthly 플래그)
    run_monthly = args.monthly or (not args.date and kst_today.day == 2)
    if run_monthly:
        # 지난달 1일
        first_of_last_month = (kst_today.replace(day=1) - timedelta(days=1)).replace(day=1)
        print(f"[5] 월간 수집 ({first_of_last_month})...")
        cookies, n = collect_period(first_of_last_month, "MONTH", "monthly", cookies, aid_map, args.dry_run)
        total += n
        print(f"  월간: {n}건 완료")

    print(f"\n완료: 총 {total}건 적재")
    return 0


if __name__ == "__main__":
    sys.exit(main())
