"""네이버 매체별 섹션 랭킹 수집 → section_ranking_snapshot 적재.

대상: DB에 naver_media_id 가 있는 활성 매체 (기본값) 또는 --media 로 지정.

사용:
  python -m scripts.collect_section_ranking
  python -m scripts.collect_section_ranking --media segye chosun joongang donga mk
  python -m scripts.collect_section_ranking --date 20260429
  python -m scripts.collect_section_ranking --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone, timedelta

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

import httpx
from bs4 import BeautifulSoup

from scripts.lib.db import get_client
from scripts.lib.revalidate import revalidate

NAVER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://media.naver.com/",
}

SECTION_ORDER = ["정치", "경제", "사회", "생활/문화", "세계", "IT/과학"]
MAX_CONCURRENT = 8


def kst_date(offset_days: int = 0) -> str:
    now = datetime.now(timezone.utc) + timedelta(hours=9, days=offset_days)
    return now.strftime("%Y%m%d")


def parse_section_html(html: str) -> list[dict]:
    """HTML → [{section_name, rank, title, url}, ...] 리스트 반환."""
    soup = BeautifulSoup(html, "html.parser")
    rows = []

    for box in soup.select("div.press_ranking_box.is_section"):
        name_el = box.select_one("strong.press_ranking_head_title")
        if not name_el:
            continue
        section_name = name_el.get_text(strip=True)

        for li in box.select("ul.press_ranking_list li.as_thumb"):
            rank_el = li.select_one("em.list_ranking_num")
            title_el = li.select_one("strong.list_title")
            a = li.select_one("a[href]")
            if not (rank_el and title_el and a):
                continue
            try:
                rank = int(rank_el.get_text(strip=True))
            except ValueError:
                continue
            rows.append(
                {
                    "section_name": section_name,
                    "rank": rank,
                    "title": title_el.get_text(strip=True),
                    "url": a["href"],
                }
            )

    return rows


async def fetch_one(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    media_company_id: int,
    naver_media_id: str,
    date_str: str,
) -> list[dict]:
    padded = naver_media_id.zfill(3)
    url = f"https://media.naver.com/press/{padded}/ranking?type=section&date={date_str}"
    async with sem:
        try:
            r = await client.get(url, headers=NAVER_HEADERS, timeout=15, follow_redirects=True)
            r.raise_for_status()
            items = parse_section_html(r.text)
            return [
                {
                    "media_company_id": media_company_id,
                    "ranking_date": f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}",
                    **item,
                }
                for item in items
            ]
        except Exception as e:
            print(f"  오류 ({naver_media_id}): {e}")
            return []


def _delete_stale_ranks(sb, all_rows: list[dict]) -> int:
    """(media, section, date) 별로 이번 수집에 없는 예전 rank 행을 삭제.

    upsert는 rank 슬롯 단위 키라서, 기사가 랭킹을 이동하면 예전 rank 자리는
    이번 수집에서 다른 기사가 그 자리를 새로 차지하지 않는 한 그대로 남는다
    (같은 기사가 여러 rank에 중복 표시되는 버그). upsert 이후에 호출해
    빈 데이터 노출 구간 없이 정리한다.
    """
    groups: dict[tuple[int, str, str], set[int]] = {}
    for row in all_rows:
        key = (row["media_company_id"], row["section_name"], row["ranking_date"])
        groups.setdefault(key, set()).add(row["rank"])

    deleted = 0
    for (media_company_id, section_name, ranking_date), ranks in groups.items():
        res = (
            sb.table("section_ranking_snapshot")
            .delete()
            .eq("media_company_id", media_company_id)
            .eq("section_name", section_name)
            .eq("ranking_date", ranking_date)
            .not_.in_("rank", list(ranks))
            .execute()
        )
        deleted += len(res.data)
    return deleted


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--media",
        nargs="*",
        help="수집 대상 normalized_name 목록 (미지정 시 naver_media_id 보유 전체 매체)",
    )
    parser.add_argument(
        "--date",
        default=None,
        help="수집 날짜 YYYYMMDD (기본: KST 오늘)",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    date_str = args.date or kst_date()
    sb = get_client()

    query = (
        sb.table("media_company")
        .select("media_company_id, name, normalized_name, naver_media_id")
        .eq("is_active", True)
        .not_.is_("naver_media_id", "null")
    )
    if args.media:
        query = query.in_("normalized_name", args.media)

    media_rows = query.execute().data
    if not media_rows:
        print("수집 대상 매체 없음")
        return

    print(f"대상 매체 {len(media_rows)}개, 날짜 {date_str}")

    sem = asyncio.Semaphore(MAX_CONCURRENT)
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[
                fetch_one(
                    client,
                    sem,
                    m["media_company_id"],
                    m["naver_media_id"],
                    date_str,
                )
                for m in media_rows
            ]
        )

    all_rows = [row for rows in results for row in rows]
    nonempty = sum(1 for rows in results if rows)
    print(f"파싱 완료: {nonempty}/{len(media_rows)}개 매체, 총 {len(all_rows)}건")

    if args.dry_run:
        for m, rows in zip(media_rows, results):
            sections = {r["section_name"] for r in rows}
            print(f"  {m['name']:<12} {len(rows)}건 섹션: {', '.join(sections) or '없음'}")
        print(f"\n[dry-run] {len(all_rows)}건 적재 생략")
        return

    if all_rows:
        sb.table("section_ranking_snapshot").upsert(
            all_rows,
            on_conflict="media_company_id,section_name,rank,ranking_date",
        ).execute()

    print(f"적재 완료: {len(all_rows)}건")
    for m, rows in zip(media_rows, results):
        if rows:
            print(f"  {m['name']}: {len(rows)}건")

    deleted = _delete_stale_ranks(sb, all_rows)
    if deleted:
        print(f"스테일 rank 정리: {deleted}건 삭제")

    revalidate("compare")


if __name__ == "__main__":
    asyncio.run(main())
