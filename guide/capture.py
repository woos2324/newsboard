# -*- coding: utf-8 -*-
"""
Newsboard 사용자 가이드용 스크린샷 자동 캡처 스크립트.

사용법 (로컬에서 직접 실행 — 최고관리자 계정이면 전 메뉴 캡처 가능):
    PowerShell:
        $env:NEWSBOARD_USER="name@segye.com"; $env:NEWSBOARD_PASS="비밀번호"; python guide/capture.py
    bash:
        NEWSBOARD_USER=name@segye.com NEWSBOARD_PASS=비밀번호 python guide/capture.py
    환경변수가 없으면 실행 중 입력 프롬프트가 뜸.

결과: guide/images/*.png 생성. 콘솔에 성공/실패 샷 목록 출력.
실패한 샷(모달·패널 등)은 화면에서 직접 캡처해 같은 파일명으로 덮어쓰면 됨.

전제: playwright 설치 + 브라우저 (pip install playwright; playwright install chromium)
"""

import os
import sys
import getpass
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "https://newsboard-two.vercel.app"
OUT = Path(__file__).resolve().parent / "images"
OUT.mkdir(exist_ok=True)

# 데스크톱 기준 뷰포트 (2x 스케일로 선명하게)
VIEWPORT = {"width": 1440, "height": 900}
SCALE = 2

results = {"ok": [], "fail": []}


def shot(page, name, full_page=False):
    """현재 페이지를 name.png 로 저장."""
    try:
        page.wait_for_timeout(900)
        page.screenshot(path=str(OUT / f"{name}.png"), full_page=full_page)
        results["ok"].append(name)
        print(f"  [OK]   {name}.png")
        return True
    except Exception as e:  # noqa: BLE001
        results["fail"].append((name, str(e)[:120]))
        print(f"  [FAIL] {name}.png  — {str(e)[:120]}")
        return False


def goto(page, path):
    page.goto(BASE + path, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(1200)


def click_first_row(page, limit=40, skip=("더보기", "전체 이슈")):
    """본문에서 클릭 가능한 첫 데이터 행/카드를 휴리스틱으로 클릭."""
    rows = page.locator("[role=button], tbody tr, li, article, a")
    for i in range(min(rows.count(), limit)):
        el = rows.nth(i)
        try:
            txt = (el.inner_text() or "").strip()
        except Exception:  # noqa: BLE001
            continue
        if len(txt) > 12 and not any(s in txt for s in skip):
            try:
                el.click(timeout=2000)
                page.wait_for_timeout(1200)
                return True
            except Exception:  # noqa: BLE001
                continue
    return False


def main():
    user = os.environ.get("NEWSBOARD_USER") or input("이메일(@segye.com): ").strip()
    pw = os.environ.get("NEWSBOARD_PASS") or getpass.getpass("비밀번호: ")

    if not user or not pw:
        print("ERROR: 이메일/비밀번호가 비어 있습니다.")
        sys.exit(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport=VIEWPORT, device_scale_factor=SCALE, locale="ko-KR")
        page = ctx.new_page()

        # ── 0. 로그인 화면 (로그인 전) ──────────────────────────────
        print("[로그인 화면 캡처]")
        goto(page, "/login")
        shot(page, "00_login")

        # ── 로그인 수행 ────────────────────────────────────────────
        print("[로그인 시도]")
        page.fill("input[name=email]", user)
        page.fill("input[name=password]", pw)
        page.click("button[type=submit]")
        try:
            page.wait_for_url(BASE + "/", timeout=20000)
        except Exception:  # noqa: BLE001
            page.wait_for_timeout(3000)
        if "/login" in page.url:
            err = ""
            try:
                err = page.inner_text(".text-error")
            except Exception:  # noqa: BLE001
                pass
            print(f"ERROR: 로그인 실패 — URL이 여전히 /login 입니다. {err}")
            browser.close()
            sys.exit(1)
        print("  로그인 성공")

        # ── 1. 전체 화면 (사이드바 + 상단바) ───────────────────────
        print("[시작하기 / 전체 화면]")
        goto(page, "/")
        shot(page, "01_shell")               # 뷰포트 (사이드바·상단바 포함)

        # ── 2. 대시보드 ────────────────────────────────────────────
        print("[대시보드]")
        shot(page, "10_dashboard", full_page=True)

        # ── 3. 이슈 모니터링 ───────────────────────────────────────
        print("[이슈 모니터링]")
        goto(page, "/issue")
        shot(page, "20_issue_list", full_page=True)

        # ── 4. 실시간 트렌드 ───────────────────────────────────────
        print("[실시간 트렌드]")
        goto(page, "/trending")
        shot(page, "30_trending", full_page=True)
        # 상세 패널 (첫 행 클릭)
        if click_first_row(page):
            shot(page, "31_trending_panel")
        else:
            print("  [FAIL] 31_trending_panel — 행 자동 클릭 실패 (수동 캡처 필요)")
            results["fail"].append(("31_trending_panel", "행 못 찾음"))

        # ── 5. 경쟁사 비교 ─────────────────────────────────────────
        print("[경쟁사 비교]")
        goto(page, "/compare")
        shot(page, "40_compare", full_page=True)

        # ── 6. 자사 기사 현황 ──────────────────────────────────────
        print("[자사 기사 현황]")
        goto(page, "/articles")
        shot(page, "50_articles", full_page=True)

        # ── 7. AI 리포트 ───────────────────────────────────────────
        print("[AI 리포트]")
        goto(page, "/report")
        shot(page, "60_report", full_page=True)

        # ── 8. 트래픽 분석 ─────────────────────────────────────────
        print("[트래픽 분석]")
        goto(page, "/traffic")
        shot(page, "70_traffic", full_page=True)

        # ── 9. 구독자 분석 ─────────────────────────────────────────
        print("[구독자 분석]")
        goto(page, "/analytics/subscribers")
        shot(page, "80_subscribers", full_page=True)

        # ── 10. 회원 관리 (최고관리자 전용) ────────────────────────
        print("[회원 관리]")
        goto(page, "/admin/users")
        if "/admin" in page.url:
            shot(page, "90_admin_users", full_page=True)
        else:
            print("  [SKIP] 90_admin_users — 최고관리자 계정이 아니어서 접근 불가")
            results["fail"].append(("90_admin_users", "최고관리자 권한 필요"))

        browser.close()

    # ── 요약 ──────────────────────────────────────────────────────
    print("\n" + "=" * 56)
    print(f"성공 {len(results['ok'])}장 / 실패 {len(results['fail'])}장")
    print(f"저장 위치: {OUT}")
    if results["fail"]:
        print("\n[수동 캡처가 필요한 샷] — 화면 직접 캡처 후 같은 파일명으로 저장:")
        for name, why in results["fail"]:
            print(f"  - {name}.png  ({why})")
    print("=" * 56)


if __name__ == "__main__":
    main()
