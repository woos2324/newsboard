from __future__ import annotations

import asyncio

import httpx

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

DEFAULT_HEADERS = {
    "User-Agent": UA,
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


async def fetch_html(
    url: str,
    *,
    timeout: float = 15.0,
    retries: int = 3,
    backoff_base: float = 1.0,
) -> str:
    last_err: Exception | None = None
    async with httpx.AsyncClient(
        headers=DEFAULT_HEADERS, follow_redirects=True, timeout=timeout
    ) as client:
        for attempt in range(retries):
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                return resp.text
            except httpx.HTTPStatusError as e:
                last_err = e
                if e.response.status_code in (429, 500, 502, 503, 504):
                    await asyncio.sleep(backoff_base * (1 + attempt * 2))
                    continue
                raise
            except httpx.RequestError as e:
                last_err = e
                await asyncio.sleep(backoff_base * (1 + attempt * 2))
    raise RuntimeError(f"fetch_html 실패 ({url}): {last_err}")
