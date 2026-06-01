"""OpenSearch(NCP SES) 클라이언트 — 기자 문체 학습용 자사 기사 조회.

인덱스: web_articles_v2
매칭 키: reporter_id (이메일 local part와 동일)
"""
from __future__ import annotations

import os
from typing import Optional
import httpx

_client: Optional[httpx.Client] = None


def _get_client() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(
            base_url=os.environ["OPENSEARCH_URL"],
            auth=(os.environ["OPENSEARCH_USER"], os.environ["OPENSEARCH_PASS"]),
            verify=False,
            timeout=30,
        )
    return _client


INDEX = os.environ.get("OPENSEARCH_INDEX", "web_articles_v2")

BASE_QUERY = {
    "bool": {
        "must": [
            {"term": {"status": "published"}},
            {"term": {"is_deleted": False}},
            {"exists": {"field": "reporter_id"}},
        ]
    }
}


def get_articles_by_reporter(
    reporter_id: str,
    size: int = 30,
    date_from: str = "2024-01-01",
) -> list[dict]:
    """기자별 최근 기사 목록 반환 (본문 포함)."""
    client = _get_client()
    query = {
        "bool": {
            "must": [
                {"term": {"status": "published"}},
                {"term": {"is_deleted": False}},
                {"term": {"reporter_id": reporter_id}},
                {"range": {"published_at": {"gte": date_from}}},
            ]
        }
    }
    body = {
        "size": size,
        "query": query,
        "sort": [{"published_at": "desc"}],
        "_source": ["article_id", "title", "body", "section", "published_at", "reporter", "reporter_id"],
    }
    r = client.post(f"/{INDEX}/_search", json=body)
    r.raise_for_status()
    return [h["_source"] for h in r.json()["hits"]["hits"]]


def list_reporters(
    domain: str = "segye.com",
    min_articles: int = 5,
    date_from: str = "2025-01-01",
) -> list[dict]:
    """reporter_id별 기사 수 목록 (학습 대상 기자 선별용).

    domain 필터: reporter_email suffix 매칭 (없으면 전체). wildcard 대신
    aggregation 결과에서 Python 레벨로 필터링.
    """
    client = _get_client()
    must = [
        {"term": {"status": "published"}},
        {"term": {"is_deleted": False}},
        {"exists": {"field": "reporter_id"}},
        {"range": {"published_at": {"gte": date_from}}},
    ]

    body = {
        "size": 0,
        "query": {"bool": {"must": must}},
        "aggs": {
            "reporters": {
                "terms": {"field": "reporter_id", "size": 500, "min_doc_count": min_articles},
                "aggs": {
                    "email": {"terms": {"field": "reporter_email", "size": 1}},
                    "latest": {"max": {"field": "published_at"}},
                },
            }
        },
    }
    r = client.post(f"/{INDEX}/_search", json=body)
    r.raise_for_status()
    buckets = r.json()["aggregations"]["reporters"]["buckets"]
    result = []
    for b in buckets:
        email_buckets = b.get("email", {}).get("buckets", [])
        email = email_buckets[0]["key"] if email_buckets else ""
        # Python 레벨 도메인 필터 (leading wildcard 회피)
        if domain and not email.endswith(f"@{domain}"):
            continue
        result.append({
            "reporter_id": b["key"],
            "reporter_name": b["key"],  # 기사 조회 시 reporter 필드에서 채움
            "reporter_email": email,
            "article_count": b["doc_count"],
            "latest_at": b["latest"]["value_as_string"],
        })
    return result
