"""해외 매체 사설 수집 + 한국어 번역 스크립트.

수집 대상: 워싱턴타임스/포스트, NYT, FT, SCMP, 마이니치, 산케이
저장: foreign_editorial 테이블 (title_original/body_original + title_ko/body_ko)

실행 예시:
    # 특정 매체만 수집 + 번역
    python -m scripts.collect_foreign_editorials --source mainichi
    python -m scripts.collect_foreign_editorials --source mainichi --no-translate

    # 모든 구현된 매체
    python -m scripts.collect_foreign_editorials --all

    # 이미 적재된 body_ko=NULL 레코드 번역 (백필)
    python -m scripts.collect_foreign_editorials --translate-backfill
    python -m scripts.collect_foreign_editorials --translate-backfill --source sankei
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime
from typing import Optional

from scripts.lib.db import get_client
from scripts.lib.foreign_collectors.base import ForeignEditorialItem
from scripts.lib.foreign_sources import SOURCES, get_source
from scripts.lib.foreign_translator import translate_article

# Windows cp949 콘솔 → UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


async def _dispatch(source_code: str, limit: int, supabase=None) -> list[ForeignEditorialItem]:
    if source_code == "wtimes":
        from scripts.lib.foreign_collectors import wtimes
        return await wtimes.collect(limit=limit, supabase=supabase)
    if source_code == "mainichi":
        from scripts.lib.foreign_collectors import mainichi
        return await mainichi.collect(limit=limit)
    if source_code == "sankei":
        from scripts.lib.foreign_collectors import sankei
        return await sankei.collect(limit=limit)
    if source_code == "guardian":
        from scripts.lib.foreign_collectors import guardian
        return await guardian.collect(limit=limit)
    if source_code == "wapo":
        from scripts.lib.foreign_collectors import wapo
        return await wapo.collect(limit=limit, supabase=supabase)
    if source_code == "nyt":
        from scripts.lib.foreign_collectors import nyt
        return await nyt.collect(limit=limit, supabase=supabase)
    if source_code == "ft":
        from scripts.lib.foreign_collectors import ft
        return await ft.collect(limit=limit, supabase=supabase)
    if source_code == "scmp":
        from scripts.lib.foreign_collectors import scmp
        return await scmp.collect(limit=limit, supabase=supabase)
    raise NotImplementedError(f"Collector not implemented yet for: {source_code}")


def _to_edition_date(published_at: Optional[str]) -> Optional[str]:
    """ISO8601 → YYYY-MM-DD (현지 시각 기준).
    Python 3.10 fromisoformat은 +HHMM(콜론 없는 오프셋)을 미지원 — 정규화 처리.
    """
    if not published_at:
        return None
    try:
        # +0900 → +09:00 변환 (Python 3.10 호환)
        import re as _re
        s = published_at.replace("Z", "+00:00")
        s = _re.sub(r"([+-])(\d{2})(\d{2})$", r"\1\2:\3", s)
        dt = datetime.fromisoformat(s)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None


async def collect_and_save(
    source_code: str,
    limit: int,
    dry_run: bool,
    translate: bool,
) -> int:
    source = get_source(source_code)
    print(f"\n[{source_code}] {source['name_ko']} ({source['name_en']}) 수집 시작")

    supabase = get_client()
    items = await _dispatch(source_code, limit, supabase=supabase)
    if not items:
        print(f"[{source_code}] 수집 결과 없음")
        return 0

    if dry_run:
        for it in items:
            print(f"  [dry] {it['title_original'][:60]} | body={len(it.get('body_original') or '')}자 | {it.get('published_at')}")
        return len(items)
    saved = 0
    for it in items:
        # 기존 레코드는 다시 번역 호출하지 않도록 url 중복 확인
        existing = supabase.table("foreign_editorial") \
            .select("foreign_editorial_id,title_ko,body_ko") \
            .eq("url", it["url"]).limit(1).execute()
        already_translated = bool(existing.data and existing.data[0].get("body_ko"))

        title_ko: Optional[str] = None
        body_ko: Optional[str] = None
        ai_meta: Optional[dict] = None
        if translate and not already_translated:
            result = await translate_article(
                title=it["title_original"],
                body=it.get("body_original"),
                source_language=source["language"],
            )
            title_ko = result["title_ko"]
            body_ko = result["body_ko"]
            ai_meta = result["ai_meta"]

        row: dict = {
            "source_code": source_code,
            "source_country": source["country"],
            "source_language": source["language"],
            "title_original": it["title_original"],
            "body_original": it.get("body_original"),
            "url": it["url"],
            "published_at": it.get("published_at"),
            "edition_date": _to_edition_date(it.get("published_at")),
            "author": it.get("author"),
        }
        if title_ko or body_ko:
            row["title_ko"] = title_ko
            row["body_ko"] = body_ko
            row["ai_meta"] = ai_meta

        try:
            supabase.table("foreign_editorial").upsert(row, on_conflict="url").execute()
            saved += 1
            status = "translated" if (title_ko or body_ko) else ("skip-tr" if already_translated else "saved")
            print(f"  [{status}] {it['title_original'][:60]}")
        except Exception as e:
            print(f"  [error] {it['url']}: {e}", file=sys.stderr)
        if translate and not already_translated:
            await asyncio.sleep(5)  # 번역 후 rate limit 분산

    print(f"[{source_code}] 저장 완료: {saved}건")
    return saved


async def translate_backfill(source_filter: Optional[str], limit: int) -> int:
    """body_ko 가 NULL 인 기존 레코드를 번역."""
    supabase = get_client()
    q = supabase.table("foreign_editorial") \
        .select("foreign_editorial_id,source_code,source_language,title_original,body_original") \
        .is_("body_ko", "null") \
        .order("foreign_editorial_id")
    if source_filter:
        q = q.eq("source_code", source_filter)
    rows = q.limit(limit).execute().data

    print(f"[backfill] 번역 대상 {len(rows)}건 (source={source_filter or 'all'})")
    if not rows:
        return 0

    translated = 0
    for r in rows:
        result = await translate_article(
            title=r["title_original"],
            body=r.get("body_original"),
            source_language=r["source_language"],
        )
        if not result["title_ko"] and not result["body_ko"]:
            print(f"  [fail] {r['title_original'][:60]} | {result['ai_meta'].get('error')}")
            continue

        supabase.table("foreign_editorial").update({
            "title_ko": result["title_ko"],
            "body_ko": result["body_ko"],
            "ai_meta": result["ai_meta"],
        }).eq("foreign_editorial_id", r["foreign_editorial_id"]).execute()

        translated += 1
        tokens = result["ai_meta"].get("total_tokens")
        print(f"  [ok] {r['title_original'][:55]} → {(result['title_ko'] or '')[:40]} | tokens={tokens}")

    print(f"[backfill] 번역 완료: {translated}/{len(rows)}건")
    return translated


def seed_cookies(source_code: str, cookies_json: Optional[str], cookies_file: Optional[str] = None) -> None:
    """브라우저에서 추출한 쿠키를 foreign_session DB에 저장.

    사용 방법:
      1. 로컬 브라우저(Chrome)에서 해당 매체에 로그인
      2. DevTools → Application → Cookies → 전체 선택 → Copy as JSON
      3. 아래 명령 실행:
         python -m scripts.collect_foreign_editorials --seed-cookies ft --cookies-json '[{...}]'
    """
    from scripts.lib.foreign_collectors.playwright_base import save_cookies
    get_source(source_code)  # 유효성 검사
    try:
        import json
        if cookies_file:
            with open(cookies_file, encoding="utf-8") as f:
                cookies_json = f.read()
        if not cookies_json:
            raise ValueError("--cookies-json 또는 --cookies-file 중 하나 필요")
        cookies = json.loads(cookies_json)
        if not isinstance(cookies, list):
            raise ValueError("cookies_json 은 JSON 배열이어야 합니다.")
    except Exception as e:
        print(f"[seed-cookies] JSON 파싱 오류: {e}", file=sys.stderr)
        sys.exit(1)

    supabase = get_client()
    save_cookies(source_code, cookies, supabase)
    from scripts.lib.foreign_collectors.playwright_base import COOKIE_TTL_DAYS
    print(f"[seed-cookies] {source_code} 쿠키 {len(cookies)}개 저장 완료 (TTL {COOKIE_TTL_DAYS}일)")


async def main(
    source: Optional[str],
    do_all: bool,
    limit: int,
    dry_run: bool,
    translate: bool,
    backfill: bool,
    backfill_limit: int,
    seed: Optional[str],
    cookies_json: Optional[str],
    cookies_file: Optional[str] = None,
):
    if seed:
        if not cookies_json and not cookies_file:
            print("--seed-cookies 사용 시 --cookies-json 또는 --cookies-file 필수", file=sys.stderr)
            sys.exit(1)
        seed_cookies(seed, cookies_json, cookies_file)
        return

    if backfill:
        await translate_backfill(source, limit=backfill_limit)
        return

    targets: list[str]
    if do_all:
        targets = list(SOURCES.keys())
    elif source:
        targets = [source]
    else:
        print("--source <code> 또는 --all 또는 --translate-backfill 옵션이 필요합니다.", file=sys.stderr)
        print(f"사용 가능 매체: {', '.join(SOURCES.keys())}", file=sys.stderr)
        sys.exit(2)

    total = 0
    for code in targets:
        try:
            total += await collect_and_save(code, limit=limit, dry_run=dry_run, translate=translate)
        except NotImplementedError as e:
            print(f"[skip] {e}", file=sys.stderr)
        except Exception as e:
            print(f"[error] {code}: {e}", file=sys.stderr)

    print(f"\n[collect_foreign_editorials] 전체 완료: {total}건")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=str, help=f"매체 코드 ({', '.join(SOURCES.keys())})")
    parser.add_argument("--all", action="store_true", help="모든 구현된 매체 수집")
    parser.add_argument("--limit", type=int, default=10, help="매체당 최대 수집 건수")
    parser.add_argument("--dry-run", action="store_true", help="DB 저장하지 않고 출력만")
    parser.add_argument("--no-translate", dest="translate", action="store_false", help="번역 생략 (수집만)")
    parser.add_argument("--seed-cookies", dest="seed", type=str, metavar="SOURCE",
                        help="로컬 브라우저 쿠키를 DB에 저장 (--cookies-json 과 함께 사용)")
    parser.add_argument("--cookies-json", type=str,
                        help='브라우저에서 복사한 쿠키 JSON 배열 문자열 (예: \'[{"name":"..."}]\')')
    parser.add_argument("--cookies-file", type=str,
                        help="쿠키 JSON 파일 경로 (예: cookies_nyt.json)")
    parser.add_argument("--translate-backfill", dest="backfill", action="store_true",
                        help="이미 적재된 body_ko=NULL 레코드만 번역 (수집 안 함)")
    parser.add_argument("--backfill-limit", type=int, default=50, help="백필 모드에서 한 번에 처리할 최대 건수")
    parser.set_defaults(translate=True)
    args = parser.parse_args()
    asyncio.run(main(
        args.source, args.all, args.limit, args.dry_run,
        args.translate, args.backfill, args.backfill_limit,
        args.seed, args.cookies_json,
        getattr(args, "cookies_file", None),
    ))
