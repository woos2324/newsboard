# -*- coding: utf-8 -*-
"""
opinion 사용자 가이드용 스크린샷 자동 캡처 스크립트.

사용법 (로컬에서 직접 실행):
    1) 공용 ID/PW를 환경변수로 넣고 실행 (권장 — 자격증명이 코드/로그에 안 남음):
        PowerShell:
            $env:OPINION_AUTH_USER="아이디"; $env:OPINION_AUTH_PASS="비밀번호"; python guide/capture.py
        bash:
            OPINION_AUTH_USER=아이디 OPINION_AUTH_PASS=비밀번호 python guide/capture.py
    2) 환경변수가 없으면 실행 중 입력 프롬프트가 뜸.

결과: guide/images/*.png 생성. 콘솔에 성공/실패 샷 목록 출력.
실패한 샷(모달·호버 동작 등)은 사용자가 직접 캡처해 같은 파일명으로 덮어쓰면 됨.
"""

import os
import sys
import getpass
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "https://opinion-eta.vercel.app"
OUT = Path(__file__).resolve().parent / "images"
OUT.mkdir(exist_ok=True)

# 데스크톱 기준 뷰포트 (2x 스케일로 선명하게)
VIEWPORT = {"width": 1440, "height": 900}
SCALE = 2

results = {"ok": [], "fail": []}


def shot(page, name, full_page=False):
    """현재 페이지를 name.png 로 저장."""
    try:
        page.wait_for_timeout(800)
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


def close_modal(page):
    """모달 닫기 (Esc 또는 바깥 클릭)."""
    try:
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
    except Exception:  # noqa: BLE001
        pass


def main():
    user = os.environ.get("OPINION_AUTH_USER") or input("공용 아이디: ").strip()
    pw = os.environ.get("OPINION_AUTH_PASS") or getpass.getpass("공용 비밀번호: ")

    if not user or not pw:
        print("ERROR: 아이디/비밀번호가 비어 있습니다.")
        sys.exit(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport=VIEWPORT, device_scale_factor=SCALE,
                                  locale="ko-KR")
        page = ctx.new_page()

        # ── 0. 로그인 화면 (로그인 전) ──────────────────────────────
        print("[로그인 화면 캡처]")
        goto(page, "/login")
        shot(page, "00_login")

        # ── 로그인 수행 ────────────────────────────────────────────
        print("[로그인 시도]")
        page.fill("#username", user)
        page.fill("#password", pw)
        page.click("button[type=submit]")
        try:
            page.wait_for_url(BASE + "/", timeout=20000)
        except Exception:  # noqa: BLE001
            page.wait_for_timeout(3000)
        # 로그인 실패 감지
        if "/login" in page.url:
            err = ""
            try:
                err = page.inner_text("p.bg-red-50")
            except Exception:  # noqa: BLE001
                pass
            print(f"ERROR: 로그인 실패 — URL이 여전히 /login 입니다. {err}")
            browser.close()
            sys.exit(1)
        print("  로그인 성공")

        # ── 1. 전체 화면 (사이드바 + 상단바) ───────────────────────
        print("[시작하기 / 전체 화면]")
        goto(page, "/")
        shot(page, "01_shell")           # 사이드바·상단바 포함 첫 화면 (뷰포트)

        # ── 2. 오늘의 사설 ─────────────────────────────────────────
        print("[오늘의 사설]")
        goto(page, "/")
        shot(page, "10_today_list", full_page=True)

        # 사설 모달 (첫 사설 행 클릭)
        try:
            # 사설 제목 행 — role/텍스트 기반이 어려우면 첫 리스트 항목 클릭
            page.locator("button, a, li, tr").filter(has_text="").first
            # 더 안전하게: 본문 영역의 클릭 가능한 사설 항목 첫 번째
            page.get_by_role("button").nth(0)
            # 휴리스틱: 사설 그룹 카드 내 첫 행 클릭
            rows = page.locator("[role=button], li, tr")
            clicked = False
            for i in range(min(rows.count(), 40)):
                el = rows.nth(i)
                txt = (el.inner_text() or "").strip()
                if len(txt) > 12 and "비교" not in txt and "더보기" not in txt:
                    el.click()
                    page.wait_for_timeout(1000)
                    clicked = True
                    break
            if clicked:
                shot(page, "11_today_modal")
            else:
                results["fail"].append(("11_today_modal", "사설 행을 못 찾음"))
                print("  [FAIL] 11_today_modal — 사설 행 자동 클릭 실패 (수동 캡처 필요)")
            close_modal(page)
        except Exception as e:  # noqa: BLE001
            print(f"  [FAIL] 11_today_modal — {str(e)[:120]} (수동 캡처 필요)")
            results["fail"].append(("11_today_modal", str(e)[:120]))

        # 주제 변경 패널 (호버 후 클릭) — 매우 fragile, 실패 시 수동
        try:
            goto(page, "/")
            target = page.get_by_text("주제 변경", exact=False).first
            target.hover()
            page.wait_for_timeout(300)
            target.click()
            page.wait_for_timeout(700)
            shot(page, "12_today_topic")
        except Exception as e:  # noqa: BLE001
            print(f"  [FAIL] 12_today_topic — {str(e)[:120]} (수동 캡처 권장)")
            results["fail"].append(("12_today_topic", str(e)[:120]))

        # ── 3. today 사설 분석 ─────────────────────────────────────
        print("[today 사설 분석]")
        goto(page, "/compare")
        shot(page, "20_compare_list", full_page=True)

        # 비교 상세 (첫 카드 클릭)
        try:
            card = page.locator("[role=button], article, .card, a").first
            cards = page.locator("[role=button], article, a, li")
            clicked = False
            for i in range(min(cards.count(), 30)):
                el = cards.nth(i)
                txt = (el.inner_text() or "").strip()
                if ("자사 포함" in txt) or ("매체 비교" in txt) or (len(txt) > 30):
                    el.click()
                    page.wait_for_timeout(1500)
                    clicked = True
                    break
            if clicked:
                shot(page, "21_compare_detail", full_page=True)
            else:
                print("  [FAIL] 21_compare_detail — 카드 자동 클릭 실패 (수동 캡처 필요)")
                results["fail"].append(("21_compare_detail", "카드 못 찾음"))
        except Exception as e:  # noqa: BLE001
            print(f"  [FAIL] 21_compare_detail — {str(e)[:120]}")
            results["fail"].append(("21_compare_detail", str(e)[:120]))

        # ── 4. 해외 논조 ───────────────────────────────────────────
        print("[해외 논조]")
        goto(page, "/foreign")
        shot(page, "30_foreign_list", full_page=True)

        try:
            rows = page.locator("[role=button], li, tr, a")
            clicked = False
            for i in range(min(rows.count(), 40)):
                el = rows.nth(i)
                txt = (el.inner_text() or "").strip()
                if len(txt) > 12 and "더보기" not in txt:
                    el.click()
                    page.wait_for_timeout(1000)
                    clicked = True
                    break
            if clicked:
                shot(page, "31_foreign_modal")
            else:
                print("  [FAIL] 31_foreign_modal — 수동 캡처 필요")
                results["fail"].append(("31_foreign_modal", "행 못 찾음"))
            close_modal(page)
        except Exception as e:  # noqa: BLE001
            print(f"  [FAIL] 31_foreign_modal — {str(e)[:120]}")
            results["fail"].append(("31_foreign_modal", str(e)[:120]))

        # ── 5. 세계일보 트렌드 ─────────────────────────────────────
        print("[세계일보 트렌드]")
        goto(page, "/trend")
        shot(page, "40_trend", full_page=True)

        # ── 6. 성향 레이블링 ───────────────────────────────────────
        print("[성향 레이블링]")
        goto(page, "/label")
        shot(page, "50_label_grid", full_page=True)

        try:
            page.get_by_role("button", name="평가").first.click()
            page.wait_for_timeout(1000)
            # 모달 본문(사설 원문)이 길어 입력 폼이 아래에 가리므로,
            # 가장 큰 스크롤 컨테이너를 끝까지 내려 '이름·성향·제출' 폼이 보이게 함
            try:
                page.evaluate("""() => {
                  let best=null, max=0;
                  for (const el of document.querySelectorAll('div')) {
                    const s = el.scrollHeight - el.clientHeight;
                    if (s > max && el.clientHeight > 200) { max = s; best = el; }
                  }
                  if (best) best.scrollTop = best.scrollHeight;
                }""")
                page.wait_for_timeout(600)
            except Exception:  # noqa: BLE001
                pass
            shot(page, "51_label_modal")
            close_modal(page)
        except Exception as e:  # noqa: BLE001
            print(f"  [FAIL] 51_label_modal — {str(e)[:120]} (수동 캡처 필요)")
            results["fail"].append(("51_label_modal", str(e)[:120]))

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
