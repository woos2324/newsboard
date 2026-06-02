"""Vercel Data Cache revalidate 유틸.

수집 스크립트 완료 후 호출해서 해당 태그의 unstable_cache를 즉시 무효화한다.
dry_run=True이면 아무것도 하지 않는다.
"""
from __future__ import annotations

import httpx

PROD_URL = "https://newsboard-two.vercel.app"
_VALID_TAGS = frozenset(["traffic", "trending", "dashboard", "compare", "articles"])


def revalidate(*tags: str, dry_run: bool = False) -> None:
    """지정한 캐시 태그를 Vercel에서 즉시 무효화한다."""
    if dry_run:
        return
    for tag in tags:
        if tag not in _VALID_TAGS:
            print(f"  [revalidate] 알 수 없는 태그 무시: {tag}")
            continue
        try:
            resp = httpx.get(
                f"{PROD_URL}/api/revalidate",
                params={"tag": tag},
                timeout=10.0,
            )
            if resp.status_code == 200:
                print(f"  [revalidate] {tag} 무효화 완료")
            else:
                print(f"  [revalidate] {tag} 실패 ({resp.status_code})")
        except Exception as e:
            print(f"  [revalidate] {tag} 오류: {e}")
