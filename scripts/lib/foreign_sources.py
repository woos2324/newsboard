"""해외 사설 수집 대상 매체 메타데이터.

각 매체별로 collector 함수가 매핑되며, collector는 index URL을 받아
list[dict] (title_original, url, published_at?, author? ...) 를 반환한다.
"""
from __future__ import annotations

from typing import Literal, TypedDict


class ForeignSource(TypedDict):
    code: str               # DB 저장용 식별자 (foreign_editorial.source_code)
    name_ko: str            # 한국어 매체명 (UI 표시용)
    name_en: str            # 영어/원문 매체명
    country: str            # 'US' / 'UK' / 'HK' / 'JP'
    language: Literal["en", "ja"]
    index_url: str          # 사설 인덱스(목록) 페이지
    paywall: Literal["none", "soft", "hard"]
    fetcher: Literal["httpx", "playwright"]
    needs_login: bool       # 구독 계정 필요 여부


SOURCES: dict[str, ForeignSource] = {
    "wtimes": {
        "code": "wtimes",
        "name_ko": "워싱턴타임스",
        "name_en": "The Washington Times",
        "country": "US",
        "language": "en",
        "index_url": "https://www.washingtontimes.com/opinion/editorials/",
        "paywall": "none",
        "fetcher": "httpx",
        "needs_login": False,
    },
    "wapo": {
        "code": "wapo",
        "name_ko": "워싱턴포스트",
        "name_en": "The Washington Post",
        "country": "US",
        "language": "en",
        "index_url": "https://www.washingtonpost.com/opinions/editorials/",
        "paywall": "soft",
        "fetcher": "playwright",
        "needs_login": True,
    },
    "nyt": {
        "code": "nyt",
        "name_ko": "뉴욕타임스",
        "name_en": "The New York Times",
        "country": "US",
        "language": "en",
        "index_url": "https://www.nytimes.com/section/opinion/editorials",
        "paywall": "hard",
        "fetcher": "playwright",
        "needs_login": True,
    },
    "ft": {
        "code": "ft",
        "name_ko": "파이낸셜타임스",
        "name_en": "Financial Times",
        "country": "UK",
        "language": "en",
        "index_url": "https://www.ft.com/opinion/the-ft-view",
        "paywall": "hard",
        "fetcher": "playwright",
        "needs_login": True,
    },
    "scmp": {
        "code": "scmp",
        "name_ko": "사우스차이나모닝포스트",
        "name_en": "South China Morning Post",
        "country": "HK",
        "language": "en",
        "index_url": "https://www.scmp.com/opinion/sc-mp-editorials",
        "paywall": "soft",
        "fetcher": "playwright",
        "needs_login": True,
    },
    "guardian": {
        "code": "guardian",
        "name_ko": "가디언",
        "name_en": "The Guardian",
        "country": "UK",
        "language": "en",
        "index_url": "https://www.theguardian.com/tone/editorials/rss",
        "paywall": "none",
        "fetcher": "httpx",
        "needs_login": False,
    },
    "mainichi": {
        "code": "mainichi",
        "name_ko": "마이니치신문",
        "name_en": "毎日新聞",
        "country": "JP",
        "language": "ja",
        "index_url": "https://mainichi.jp/editorial/",
        "paywall": "soft",
        "fetcher": "httpx",
        "needs_login": False,
    },
    "sankei": {
        "code": "sankei",
        "name_ko": "산케이신문",
        "name_en": "産経新聞",
        "country": "JP",
        "language": "ja",
        "index_url": "https://www.sankei.com/column/editorial/",
        "paywall": "soft",
        "fetcher": "httpx",
        "needs_login": False,
    },
}


def get_source(code: str) -> ForeignSource:
    if code not in SOURCES:
        raise ValueError(f"Unknown source code: {code}. Available: {list(SOURCES.keys())}")
    return SOURCES[code]
