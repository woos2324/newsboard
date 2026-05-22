"""해외 사설 수집기 공통 데이터 구조."""
from __future__ import annotations

from typing import Optional, TypedDict


class ForeignEditorialItem(TypedDict, total=False):
    source_code: str
    url: str
    title_original: str
    body_original: Optional[str]
    author: Optional[str]
    published_at: Optional[str]   # ISO8601 with tz
