"""네이버 기사별 댓글 수 수집 → comment_metric 적재.

대상: 자사(세계일보) + 경쟁사 4개(조선, 중앙, 동아, 매경)

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
from datetime import datetime, timedelta, timezone

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

import httpx

from scripts.lib.db import get_client

TARGET_MEDIA = ["segye", "chosun", "joongang", "donga", "mk"]

CBOX_URL = "https://apis.naver.com/commentBox/cbox5/web_naver_list_jsonp.json"
ARTICLE_URL_RE = re.compile(r"n\.news\.naver\.com/(?:mnews/)?article/(\d+)/(\d+)")
JSONP_RE = re.compile(r"\((\{.+\})\)\s*;?\s*$", re.DOTALL)

# 동시 요청 수 제한 (Naver rate-limit 회피)
_SEM = asyncio.Semaphore(10)

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


async def fetch_comment_count(
    client: httpx.AsyncClient, oid: str, aid: str
) -> tuple[int, int | None]:
    """(comment_count, like_count) 반환. 실패 시 (0, None)."""
    params = {
        "ticket": "news",
        "templateId": "default_society",
        "pool": "cbox3",
        "lang": "ko",
        "objectId": f"news{oid}_{aid}",
        "pageSize": "1",
        "listType": "OBJECT",
        "_callback": "cb",
    }
    async with _SEM:
        try:
            resp = await client.get(CBOX_URL, params=params, timeout=8.0)
            resp.raise_for_status()
            m = JSONP_RE.search(resp.text)
            if not m:
                return 0, None
            data = json.loads(m.group(1))
            count = data.get("result", {}).get("count", {})
            comment_count = count.get("totalCount", 0)
            like_count = count.get("userCount", None)
            return comment_count, like_count
        except Exception:
            return 0, None


def _engagement_score(comment_count: int, like_count: int | None) -> float:
    c_score = min(math.log1p(comment_count) / math.log1p(1000) * 100, 100)
    if like_count:
        l_score = min(math.log1p(like_count) / math.log1p(5000) * 100, 100)
        return round(c_score * 0.7 + l_score * 0.3, 4)
    return round(c_score, 4)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hours", type=int, default=24, help="대상 기사 시간 윈도우")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sb = get_client()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=args.hours)).isoformat()

    media_rows = (
        sb.table("media_company")
        .select("media_company_id, name, normalized_name")
        .in_("normalized_name", TARGET_MEDIA)
        .eq("is_active", True)
        .execute()
        .data
    )
    if not media_rows:
        print("대상 매체 없음 (TARGET_MEDIA 에 일치하는 활성 매체가 없음)")
        return

    media_ids = [m["media_company_id"] for m in media_rows]
    media_map = {m["media_company_id"]: m["name"] for m in media_rows}

    articles = (
        sb.table("article")
        .select("article_id, url, media_company_id")
        .in_("media_company_id", media_ids)
        .gte("published_at", cutoff)
        .execute()
        .data
    )
    print(f"대상 기사 {len(articles)}건 (최근 {args.hours}h, {len(media_rows)}개 매체)")

    parseable: list[tuple[int, int, str, str]] = []
    for art in articles:
        m = ARTICLE_URL_RE.search(art.get("url") or "")
        if m:
            parseable.append((art["article_id"], art["media_company_id"], m.group(1), m.group(2)))

    skipped = len(articles) - len(parseable)
    print(f"  URL 파싱 성공 {len(parseable)}건" + (f" (스킵 {skipped}건)" if skipped else ""))

    if not parseable:
        print("수집 가능한 기사 없음 (n.news.naver.com URL 형식 기사가 없음)")
        return

    now_iso = datetime.now(timezone.utc).isoformat()

    async with httpx.AsyncClient(
        headers={"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9"},
        follow_redirects=True,
    ) as client:
        tasks = [
            fetch_comment_count(client, oid, aid)
            for _, _, oid, aid in parseable
        ]
        results = await asyncio.gather(*tasks)

    metric_rows = []
    for (article_id, media_id, oid, aid), (comment_count, like_count) in zip(
        parseable, results
    ):
        score = _engagement_score(comment_count, like_count)
        metric_rows.append(
            {
                "article_id": article_id,
                "measured_at": now_iso,
                "comment_count": comment_count,
                "like_count": like_count,
                "engagement_score": score,
                "source": "NAVER",
            }
        )

    if args.dry_run:
        from collections import Counter
        media_cnt: Counter[int] = Counter(mid for _, mid, _, _ in parseable)
        for mid, cnt in media_cnt.most_common():
            # 댓글 있는 기사만 출력 (상위 3개)
            sample = [
                (r["comment_count"], r["like_count"])
                for r, (art_id, m_id, _, _) in zip(metric_rows, parseable)
                if m_id == mid
            ]
            sample.sort(reverse=True)
            top = sample[:3]
            print(f"  {media_map.get(mid, mid):<10} {cnt}건, 상위댓글: {top}")
        print(f"\n[dry-run] {len(metric_rows)}건 적재 생략")
        return

    if metric_rows:
        sb.table("comment_metric").insert(metric_rows).execute()

    from collections import Counter
    media_cnt = Counter(mid for _, mid, _, _ in parseable)
    print(f"\n적재 완료: {len(metric_rows)}건")
    for mid, cnt in media_cnt.most_common():
        print(f"  {media_map.get(mid, mid)}: {cnt}건")


if __name__ == "__main__":
    asyncio.run(main())
