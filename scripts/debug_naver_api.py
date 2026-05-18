"""
네이버 파트너센터 JSON API 직접 호출 검증 (디버그용, 1회 실행)

목적:
  로그인 쿠키만으로 4개 데이터 API를 GET 호출해 JSON을 받을 수 있는지 확인.
  성공하면 xlsx 다운로드 방식을 버리고 JSON 방식으로 운영 스크립트를 교체.

실행:
  # 환경변수 설정 (PowerShell)
  $env:NAVER_PARTNER_ID="segyenews1"
  $env:NAVER_PARTNER_PW="..."
  python -m scripts.debug_naver_api

  # 또는 .env.local에 NAVER_PARTNER_ID / NAVER_PARTNER_PW 추가 후 그냥 실행

결과:
  samples/_debug_api_result.txt 에 4개 API 응답 저장 (UTF-8)
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = PROJECT_ROOT / ".env.local"
OUTPUT_PATH = PROJECT_ROOT / "samples" / "_debug_api_result.txt"

if ENV_PATH.exists():
    load_dotenv(ENV_PATH, override=False)

KST = timezone(timedelta(hours=9))

# 어제 날짜 (KST 기준)
YESTERDAY = (datetime.now(KST) - timedelta(days=1)).strftime("%Y-%m-%d")

# 4개 데이터 API
API_BASE = "https://news-stat-admin.navercorp.com"
API_ENDPOINTS = {
    "article_pv":    f"{API_BASE}/api/rank/article/cv",
    "hourly_pv":     f"{API_BASE}/api/userV2/time",
    "traffic_source":f"{API_BASE}/api/user/referer",
    "search_keyword":f"{API_BASE}/api/search/keywordTotal",
}

API_PARAMS = {
    "timeDimension": "DATE",
    "startDate": YESTERDAY,
    "section": "total",
    "device": "TOTAL",
    "channelMainTabType": "ALL",
}

LOGIN_URL = "https://friend.navercorp.com/login/loginForm.sec"
NEWS_STAND_URL = (
    "https://pub-iims.navercorp.com/view/svc/main"
    "?svcId=STD&lz=ko_KR&tz=Asia%2FSeoul%3A%2B09%3A00"
)


def write_log(out, *args, sep=" ", end="\n"):
    """stdout과 파일에 동시 출력. Windows 콘솔 한글 깨짐 방지."""
    msg = sep.join(str(a) for a in args) + end
    out.write(msg)
    out.flush()
    try:
        print(msg, end="")
    except UnicodeEncodeError:
        # 콘솔 한글 깨지면 무시. 파일에는 정상 저장됨.
        pass


def main() -> int:
    naver_id = os.environ.get("NAVER_PARTNER_ID")
    naver_pw = os.environ.get("NAVER_PARTNER_PW")
    if not naver_id or not naver_pw:
        print("❌ NAVER_PARTNER_ID / NAVER_PARTNER_PW 환경변수 필요", file=sys.stderr)
        return 1

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    out = OUTPUT_PATH.open("w", encoding="utf-8")

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("❌ playwright 미설치. pip install playwright && playwright install chromium", file=sys.stderr)
        return 1

    write_log(out, f"=== 네이버 파트너센터 JSON API 검증 ({datetime.now(KST):%Y-%m-%d %H:%M KST}) ===")
    write_log(out, f"대상 날짜: {YESTERDAY}")
    write_log(out, f"계정: {naver_id}")
    write_log(out, "")

    # 환경변수로 headless 토글 가능 (HEADLESS=0 이면 브라우저 표시)
    headless = os.environ.get("HEADLESS", "1") != "0"

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-features=IsolateOrigins,site-per-process",
            ],
        )
        ctx = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="ko-KR",
            viewport={"width": 1366, "height": 900},
        )
        # Stealth: navigator.webdriver / plugins / languages / chrome 패치 (봇 감지 우회)
        ctx.add_init_script(
            """
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins',   { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
            window.chrome = { runtime: {} };
            const originalQuery = window.navigator.permissions?.query;
            if (originalQuery) {
                window.navigator.permissions.query = (parameters) =>
                    parameters.name === 'notifications'
                        ? Promise.resolve({ state: Notification.permission })
                        : originalQuery(parameters);
            }
            """
        )
        page = ctx.new_page()

        # 1. 로그인
        write_log(out, f"[1/4] 로그인 (headless={headless})...")
        page.goto(LOGIN_URL, wait_until="networkidle")

        # 페이지 alert/dialog 자동 닫기 + 메시지 캡처
        captured_dialogs: list[str] = []
        def _on_dialog(d):
            captured_dialogs.append(d.message)
            d.dismiss()
        page.on("dialog", _on_dialog)

        # fill 대신 type 사용 — 실제 키보드 이벤트(keydown/keyup) 발생
        # 네이버 폼의 JS 암호화는 keyup 이벤트로 트리거되는 경우가 많음
        page.click("#user_id")
        page.keyboard.type(naver_id, delay=80)
        page.click("#user_pw")
        page.keyboard.type(naver_pw, delay=80)

        # encnm/encpw가 채워질 때까지 명시적 대기 (최대 5초)
        try:
            page.wait_for_function(
                "() => document.getElementById('encnm') && document.getElementById('encnm').value.length > 10",
                timeout=5000,
            )
            write_log(out, "  ✓ encnm 채워짐 (JS 암호화 정상 실행)")
        except Exception:
            write_log(out, "  ⚠ encnm 미채움 (5초 대기 후에도 비어있음)")
            page.wait_for_timeout(500)  # 그래도 한 번 더 시도해보기 위해 잠시 대기

        # 입력 후 폼 상태 확인 (디버깅용)
        try:
            enc_state = page.evaluate("""() => ({
                id_val:    document.getElementById('user_id')?.value || '',
                pw_filled: !!document.getElementById('user_pw')?.value,
                encnm:     document.getElementById('encnm')?.value || '',
                encpw:     document.getElementById('encpw')?.value || '',
            })""")
            write_log(out, f"  입력 직전 폼 상태:")
            write_log(out, f"    user_id 값: {enc_state['id_val']!r}")
            write_log(out, f"    user_pw 입력됨: {enc_state['pw_filled']}")
            write_log(out, f"    encnm 길이: {len(enc_state['encnm'])}")
            write_log(out, f"    encpw 길이: {len(enc_state['encpw'])}")
            if enc_state["encnm"] == "" or enc_state["encpw"] == "":
                write_log(out, f"    ⚠ encnm/encpw 비어있음 — JS 암호화 미실행")
        except Exception as e:
            write_log(out, f"  (폼 상태 확인 실패: {e})")

        page.click("#btn-login")
        page.wait_for_load_state("networkidle")

        # 로그인 후 alert 메시지가 떴다면 출력
        if captured_dialogs:
            write_log(out, f"  ⚠ 페이지 dialog: {captured_dialogs}")

        # 스크린샷 + HTML 저장 (실패 진단용)
        if "login" in page.url.lower() or "loginForm" in page.url:
            shot_path = PROJECT_ROOT / "samples" / "_debug_login_fail.png"
            html_path = PROJECT_ROOT / "samples" / "_debug_login_fail.html"
            page.screenshot(path=str(shot_path), full_page=True)
            html_path.write_text(page.content(), encoding="utf-8")
            write_log(out, f"❌ 로그인 실패. 현재 URL: {page.url}")
            write_log(out, f"   스크린샷: {shot_path}")
            write_log(out, f"   HTML: {html_path}")

            # 페이지에 보이는 에러 텍스트 추출
            try:
                err_texts = page.evaluate("""() => {
                    const all = [];
                    document.querySelectorAll('.error, .alert, .msg, .error-msg, [class*=error]').forEach(el => {
                        const t = (el.innerText || '').trim();
                        if (t) all.push(t);
                    });
                    return all;
                }""")
                if err_texts:
                    write_log(out, f"   페이지 에러 텍스트: {err_texts}")
            except Exception:
                pass

            browser.close()
            out.close()
            return 1
        write_log(out, f"  ✓ 로그인 OK. 도착 URL: {page.url}")

        # 2. NEWS STAND 통계 어드민 진입 (SSO)
        write_log(out, "")
        write_log(out, "[2/4] NEWS STAND 페이지 이동 (SSO 통과)...")
        page.goto(NEWS_STAND_URL, wait_until="networkidle")
        write_log(out, f"  도착 URL: {page.url}")

        # news-stat-admin.navercorp.com 으로 한 번 더 이동해서 쿠키 굳히기
        try:
            page.goto(f"{API_BASE}/", wait_until="networkidle", timeout=15000)
            write_log(out, f"  통계 어드민 URL: {page.url}")
        except Exception as e:
            write_log(out, f"  (통계 어드민 직접 접근 실패 — SSO 흐름 다를 수 있음: {e})")

        # 3. 쿠키 추출
        write_log(out, "")
        write_log(out, "[3/4] 쿠키 추출...")
        all_cookies = ctx.cookies()
        cookie_domains: dict[str, list[str]] = {}
        for c in all_cookies:
            cookie_domains.setdefault(c["domain"], []).append(c["name"])
        for domain, names in cookie_domains.items():
            write_log(out, f"  [{domain}] {len(names)}개: {', '.join(names[:5])}{'...' if len(names) > 5 else ''}")

        # news-stat-admin.navercorp.com 도메인 쿠키만 추출
        stat_cookies = {c["name"]: c["value"] for c in all_cookies
                        if "news-stat-admin.navercorp.com" in c["domain"] or "navercorp.com" in c["domain"]}
        write_log(out, f"  → API 호출용 쿠키 {len(stat_cookies)}개 확보")

        # 4. API 4개 호출
        write_log(out, "")
        write_log(out, "[4/4] JSON API 호출 검증...")

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "ko-KR,ko;q=0.9",
            "Referer": f"{API_BASE}/",
        }

        results: dict[str, dict] = {}
        for key, url in API_ENDPOINTS.items():
            write_log(out, "")
            write_log(out, f"  ── {key} ──")
            write_log(out, f"    URL: {url}")
            try:
                resp = httpx.get(url, params=API_PARAMS, headers=headers, cookies=stat_cookies, timeout=20)
                write_log(out, f"    status: {resp.status_code}")
                write_log(out, f"    content-type: {resp.headers.get('content-type')}")
                write_log(out, f"    length: {len(resp.text)} bytes")

                if resp.status_code == 200 and "json" in resp.headers.get("content-type", "").lower():
                    try:
                        data = resp.json()
                        # 응답 구조 일부만 출력
                        preview = json.dumps(data, ensure_ascii=False, indent=2)
                        if len(preview) > 2000:
                            preview = preview[:2000] + "\n... (truncated)"
                        write_log(out, f"    JSON preview:")
                        for line in preview.split("\n")[:50]:
                            write_log(out, f"      {line}")
                        results[key] = {"ok": True, "data": data}
                    except Exception as e:
                        write_log(out, f"    JSON 파싱 실패: {e}")
                        write_log(out, f"    body[:500]: {resp.text[:500]}")
                        results[key] = {"ok": False, "reason": "json_parse"}
                else:
                    write_log(out, f"    ❌ 예상과 다른 응답")
                    write_log(out, f"    body[:500]: {resp.text[:500]}")
                    results[key] = {"ok": False, "reason": f"status={resp.status_code}"}
            except Exception as e:
                write_log(out, f"    ❌ 요청 실패: {e}")
                results[key] = {"ok": False, "reason": str(e)}

        browser.close()

        # 5. 결론
        write_log(out, "")
        write_log(out, "=" * 50)
        ok_count = sum(1 for r in results.values() if r["ok"])
        write_log(out, f"결과: {ok_count}/4 API 성공")
        if ok_count == 4:
            write_log(out, "✓ JSON 방식으로 운영 가능. xlsx 다운로드 불필요.")
        elif ok_count > 0:
            write_log(out, "⚠ 일부 성공. 실패한 API는 헤더/파라미터 추가 분석 필요.")
        else:
            write_log(out, "❌ 모든 API 실패. xlsx 다운로드 방식으로 폴백 검토.")

        # 전체 JSON 응답을 별도 파일에 저장 (구조 분석용)
        if ok_count > 0:
            json_path = PROJECT_ROOT / "samples" / "_debug_api_responses.json"
            with json_path.open("w", encoding="utf-8") as f:
                json.dump(
                    {k: v["data"] for k, v in results.items() if v["ok"]},
                    f, ensure_ascii=False, indent=2
                )
            write_log(out, f"\n전체 JSON 응답: {json_path}")

    out.close()
    print(f"\n결과 저장: {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
