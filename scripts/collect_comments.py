"""네이버 기사별 댓글 수 수집 → comment_metric 적재.

대상: 활성 + naver_media_id 보유 매체 전체 (경쟁사 비교 선택 가능 매체와 동일).
Naver 댓글 API(httpx) 직접 호출 — Playwright 불필요.

사용:
  python -m scripts.collect_comments
  python -m scripts.collect_comments --hours 24
  python -m scripts.collect_comments --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import json
import math
import re
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

import httpx

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

from scripts.lib.db import get_client
from scripts.lib.revalidate import revalidate

ARTICLE_URL_RE = re.compile(r"n\.news\.naver\.com/(?:mnews/)?article/(\d+)/(\d+)")
MAX_CONCURRENT = 10

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Referer": "https://news.naver.com/",
    "Accept": "application/json, text/javascript, */*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9",
}

_COMMENT_API = (
    "https://apis.naver.com/commentBox/cbox/web_naver_list_jsonp.json"
    "?ticket=news&templateId=default&pool=cbox5&lang=ko&country=KR"
    "&objectId=news{oid},{aid}&pageSize=1&sort=NEW&_cv=20140318"
)


def _parse_jsonp_count(text: str) -> int:
    """JSONP 응답에서 total 댓글 수 추출."""
    m = re.search(r"\((\{.*\})\)\s*;?\s*$", text, re.DOTALL)
    if not m:
        return 0
    try:
        data = json.loads(m.group(1))
        return int((data.get("result") or {}).get("count", {}).get("total", 0))
    except (json.JSONDecodeError, TypeError, ValueError):
        return 0


def _engagement_score(comment_count: int) -> float:
    return round(min(math.log1p(comment_count) / math.log1p(1000) * 100, 100), 4)


async def _fetch_one(
    client: httpx.AsyncClient, oid: str, aid: str, sem: asyncio.Semaphore
) -> int:
    async with sem:
        url = _COMMENT_API.format(oid=oid, aid=aid)
        for attempt in range(3):
            try:
                resp = await client.get(url, timeout=10.0)
                resp.raise_for_status()
                count = _parse_jsonp_count(resp.text)
                await asyncio.sleep(0.5)
                return count
            except httpx.HTTPStatusError as e:
                if e.response.status_code in (429, 500, 502, 503) and attempt < 2:
                    await asyncio.sleep(1 + attempt * 2)
                    continue
                return 0
            except Exception:
                if attempt < 2:
                    await asyncio.sleep(1)
                    continue
                return 0
    return 0


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sb = get_client()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=args.hours)).isoformat()

    # 대상 = 활성 + naver_media_id 보유 매체 전체 (경쟁사 비교 선택 가능 매체와 동일)
    media_rows = (
        sb.table("media_company")
        .select("media_company_id, name, normalized_name")
        .eq("is_active", True)
        .not_.is_("naver_media_id", "null")
        .execute()
        .data
    )
    if not media_rows:
        print("대상 매체 없음")
        return

    media_map = {m["media_company_id"]: m["name"] for m in media_rows}
    media_ids = list(media_map.keys())

    articles = (
        sb.table("article")
        .select("article_id, url, media_company_id")
        .in_("media_company_id", media_ids)
        .gte("published_at", cutoff)
        .execute()
        .data
    )
    print(f"대상 기사 {len(articles)}건 (최근 {args.hours}h, {len(media_rows)}개 매체)")

    targets: list[tuple[int, int, str, str]] = []
    for art in articles:
        m = ARTICLE_URL_RE.search(art.get("url") or "")
        if m:
            targets.append((art["article_id"], art["media_company_id"], m.group(1), m.group(2)))

    skipped = len(articles) - len(targets)
    print(f"  URL 파싱 성공 {len(targets)}건" + (f" (스킵 {skipped}건)" if skipped else ""))

    if not targets:
        print("수집 가능한 기사 없음")
        return

    sem = asyncio.Semaphore(MAX_CONCURRENT)
    now_iso = datetime.now(timezone.utc).isoformat()

    print(f"댓글 수 조회 중 (동시 {MAX_CONCURRENT}개)…")
    async with httpx.AsyncClient(headers=_HEADERS, follow_redirects=True) as client:
        counts = await asyncio.gather(
            *[_fetch_one(client, oid, aid, sem) for _, _, oid, aid in targets]
        )

    metric_rows = [
        {
            "article_id": article_id,
            "measured_at": now_iso,
            "comment_count": count,
            "like_count": None,
            "engagement_score": _engagement_score(count),
            "source": "NAVER",
        }
        for (article_id, _, _, _), count in zip(targets, counts)
    ]

    nonzero = sum(1 for r in metric_rows if r["comment_count"] > 0)
    print(f"  댓글 있는 기사: {nonzero}건 / {len(metric_rows)}건")

    if args.dry_run:
        media_cnt: Counter[int] = Counter(mid for _, mid, _, _ in targets)
        for mid, cnt in media_cnt.most_common():
            rows_for = sorted(
                [r["comment_count"] for r, (_, m_id, _, _) in zip(metric_rows, targets) if m_id == mid],
                reverse=True,
            )
            print(f"  {media_map.get(mid, mid):<10} {cnt}건, 상위: {rows_for[:3]}")
        print(f"\n[dry-run] {len(metric_rows)}건 적재 생략")
        return

    if metric_rows:
        sb.table("comment_metric").insert(metric_rows).execute()

    media_cnt = Counter(mid for _, mid, _, _ in targets)
    print(f"\n적재 완료: {len(metric_rows)}건")
    for mid, cnt in media_cnt.most_common():
        print(f"  {media_map.get(mid, mid)}: {cnt}건")
    revalidate("dashboard")
    revalidate("compare")


if __name__ == "__main__":
    asyncio.run(main())
