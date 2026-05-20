"""네이버 파트너센터 JSON API 응답 파서.

모든 API 응답은 column-oriented 형태:
  result.statDataList[N].data.columnInfo = ["col1", "col2", ...]
  result.statDataList[N].data.rows = {"col1": [...], "col2": [...]}

이를 list[dict] (row-oriented)로 변환 후 dataclass로 파싱한다.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))


@dataclass
class ArticlePvJsonRow:
    rank: int
    data_date: date
    article_url: str           # 원본 uri (e.g. http://news.naver.com/...?oid=022&aid=...)
    article_aid: str           # uri에서 추출한 aid (article 테이블 매칭용)
    pv: int
    pv_ratio: float
    reporter_name: str | None
    title: str
    article_published_at: datetime  # KST


@dataclass
class HourlyPvJsonRow:
    data_date: date
    hour: int
    pv: int


@dataclass
class TrafficSourceJsonRow:
    data_date: date
    source_category: str
    is_search_engine: bool
    pv: int
    pv_ratio: float


@dataclass
class SearchKeywordJsonRow:
    data_date: date
    rank: int
    keyword: str
    clicks: int
    click_ratio: float


def _to_rows(data: dict) -> list[dict]:
    """column-oriented dict → list[dict] (row-oriented)."""
    cols: list[str] = data.get("columnInfo", [])
    rows_map: dict = data.get("rows", {})
    if not cols:
        return []
    n = len(rows_map.get(cols[0], []))
    return [{col: rows_map[col][i] for col in cols} for i in range(n)]


def _find_stat(payload: dict, data_id: str) -> dict:
    """statDataList에서 dataId가 일치하는 data 블록 반환."""
    for stat in payload.get("result", {}).get("statDataList", []):
        if stat.get("dataId") == data_id:
            return stat.get("data", {})
    return {}


def _extract_aid(uri: str) -> str:
    """?aid=0004128805 또는 /022/0004128805 형태에서 aid(숫자) 추출."""
    m = re.search(r"aid=(\d+)", uri)
    if m:
        return m.group(1)
    m = re.search(r"/\d{3}/(\d{7,12})", uri)
    return m.group(1) if m else ""


def _parse_kst_datetime(s: str) -> datetime:
    """'YYYY-MM-DD HH:MM:SS' 문자열 → KST aware datetime."""
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=KST)


def parse_article_pv_json(payload: dict) -> list[ArticlePvJsonRow]:
    data = _find_stat(payload, "normal")
    rows = _to_rows(data)
    result: list[ArticlePvJsonRow] = []
    for rank, row in enumerate(rows, 1):
        uri = row.get("uri", "")
        aid = _extract_aid(uri)
        date_str = row.get("date", "")
        data_date = date.fromisoformat(date_str) if date_str else date.today()
        create_str = row.get("createDate", "")
        try:
            published_at = _parse_kst_datetime(create_str)
        except ValueError:
            published_at = datetime.now(KST)
        result.append(ArticlePvJsonRow(
            rank=rank,
            data_date=data_date,
            article_url=uri,
            article_aid=aid,
            pv=int(row.get("cv", 0)),
            pv_ratio=float(row.get("cv_p", 0)),
            reporter_name=row.get("reporter") or None,
            title=row.get("title", ""),
            article_published_at=published_at,
        ))
    return result


def parse_hourly_pv_json(payload: dict, data_date: date) -> list[HourlyPvJsonRow]:
    data = _find_stat(payload, "time")
    rows = _to_rows(data)
    result: list[HourlyPvJsonRow] = []
    for row in rows:
        hour_str = row.get("date", "0")
        try:
            hour = int(hour_str)
        except ValueError:
            continue
        # startDate = 어제 → cv가 실제 값
        # startDate = 오늘 → cv=0, cv_yesterday=어제 값
        # 수집 로직에서 startDate=어제로 호출하므로 cv가 실데이터
        pv = int(row.get("cv", 0))
        result.append(HourlyPvJsonRow(data_date=data_date, hour=hour, pv=pv))
    return result


def parse_traffic_source_json(payload: dict) -> list[TrafficSourceJsonRow]:
    data = _find_stat(payload, "referer")
    rows = _to_rows(data)
    result: list[TrafficSourceJsonRow] = []
    for row in rows:
        date_str = row.get("date", "")
        data_date = date.fromisoformat(date_str) if date_str else date.today()
        result.append(TrafficSourceJsonRow(
            data_date=data_date,
            source_category=row.get("referrerDomain", ""),
            is_search_engine=str(row.get("referrerSearchEngine", "0")) == "1",
            pv=int(row.get("cv", 0)),
            pv_ratio=float(row.get("cv_p", 0)),
        ))
    return result


def parse_daily_cv_json(payload: dict, data_date: date) -> int:
    """visitV2/cv 응답에서 총 PV(cv) 추출. 실패 시 0 반환."""
    try:
        for stat in payload.get("result", {}).get("statDataList", []):
            rows = _to_rows(stat.get("data", {}))
            for row in rows:
                if "cv" in row:
                    return int(row.get("cv", 0) or 0)
    except Exception:
        pass
    return 0


def parse_search_keyword_json(payload: dict) -> list[SearchKeywordJsonRow]:
    data = _find_stat(payload, "searchKeywordTotal")
    rows = _to_rows(data)
    result: list[SearchKeywordJsonRow] = []
    for rank, row in enumerate(rows, 1):
        date_str = row.get("date", "")
        data_date = date.fromisoformat(date_str) if date_str else date.today()
        result.append(SearchKeywordJsonRow(
            data_date=data_date,
            rank=rank,
            keyword=row.get("searchQuery", ""),
            clicks=int(row.get("contentClick", 0)),
            click_ratio=float(row.get("contentClick_p", 0)),
        ))
    return result
