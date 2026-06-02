"""
팩트 추출 — related_news URL 크롤링 + GPT gpt-4o-mini 팩트 추출.
article_fact 테이블에 UNIQUE(keyword, source_url) 기준 Lazy 캐싱.
타사 원문(raw_body)은 저장하지 않음 — 저작권 보호.
"""
from __future__ import annotations

import asyncio
import re

import httpx
from bs4 import BeautifulSoup

from api.lib import ai, db

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

_FACT_SCHEMA = """{
  "summary": "한 줄 요약",
  "who": ["관련 인물·기관"],
  "what": "핵심 사건",
  "when": "시점",
  "where": "장소",
  "figures": [{"label": "수치 항목", "value": "값", "source": "출처매체"}],
  "quotes": [{"speaker": "발언자", "text": "발언 요지", "source": "출처매체"}],
  "background": "맥락 정보",
  "source_articles": ["매체명1", "매체명2"]
}"""

_SYSTEM = (
    "아래 기사 본문에서 사실 요소만 구조화해 추출하라. "
    "의견·해석·수식어는 제외하고, 검증 가능한 사실만 담아라."
)

# 본문 추출 셀렉터 (우선순위 순)
_BODY_SELECTORS = [
    "article",
    "[class*='article-body']", "[class*='article_body']",
    "[class*='news-body']",    "[class*='newsBody']",
    "[class*='article-content']", "[class*='articleContent']",
    ".article", "#article", "main",
]


def _is_korean(text: str, threshold: float = 0.2) -> bool:
    """한글 비율이 threshold 이상이면 한국어 본문으로 판단."""
    if not text or len(text) < 50:
        return False
    hangul = len(re.findall(r"[가-힣]", text))
    return hangul / len(text) >= threshold


async def _fetch_body(url: str) -> tuple[str | None, str | None]:
    """URL에서 (기사 본문 텍스트, og:image URL) 추출. 실패 시 (None, None)."""
    try:
        async with httpx.AsyncClient(
            headers={
                "User-Agent": _UA,
                "Accept-Language": "ko-KR,ko;q=0.9",
                "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            },
            follow_redirects=True,
            timeout=15.0,
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")

        # og:image 추출
        image_url: str | None = None
        og_image = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "twitter:image"})
        if og_image:
            image_url = og_image.get("content") or None

        for tag in soup(["script", "style", "nav", "header", "footer", "aside"]):
            tag.decompose()

        for sel in _BODY_SELECTORS:
            el = soup.select_one(sel)
            if el:
                text = el.get_text(separator="\n", strip=True)
                if len(text) > 200:
                    return text[:3000], image_url

        body = soup.body
        if body:
            text = body.get_text(separator="\n", strip=True)
            return (text[:3000] if len(text) > 200 else None), image_url

    except Exception:
        return None, None

    return None, None


async def _call_gpt(keyword: str, body: str, source_name: str) -> dict:
    """GPT gpt-4o-mini로 단일 기사 본문에서 팩트 추출. 설계서 §7 프롬프트."""
    user = (
        f"[JSON 스키마]\n{_FACT_SCHEMA}\n\n"
        "[규칙]\n"
        "- 본문에 없는 내용 추가 금지.\n"
        "- 모든 수치·인용에 어느 매체에서 왔는지 source를 붙여라.\n"
        "- 한국어 기사가 아니거나 키워드와 무관한 본문은 무시하고 "
        '{"summary":"무관한 기사","who":[],"what":"","when":"","where":"",'
        '"figures":[],"quotes":[],"background":"","source_articles":[]} 반환.\n'
        "- 출력은 위 JSON 스키마만. 다른 텍스트 없이 JSON만 반환.\n\n"
        f"[키워드] {keyword}\n"
        f"[출처] {source_name}\n"
        f"[기사 본문]\n{body}"
    )
    raw, _ = await ai.chat_completion(
        [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": user},
        ],
        model="gpt-4o-mini",
        response_format_json=True,
    )
    return ai._extract_json(raw)


async def _process_one(
    keyword: str,
    news_item: dict,
    supabase,
) -> dict | None:
    """단일 related_news 항목 처리. 크롤링 → 팩트 추출 → 저장. 실패 시 None."""
    url = news_item.get("url", "")
    source = news_item.get("source", "")

    body, image_url = await _fetch_body(url)
    if not body or not _is_korean(body):
        return None

    try:
        facts = await _call_gpt(keyword, body, source)
    except Exception:
        return None

    # og:image를 facts에 포함 (참고용 이미지 — 타사 저작물이므로 URL만 저장)
    if image_url:
        facts["image_url"] = image_url

    row = {
        "keyword": keyword,
        "source_url": url,
        "source_name": source,
        "facts": facts,
    }
    try:
        supabase.table("article_fact").upsert(
            row, on_conflict="keyword,source_url"
        ).execute()
    except Exception:
        pass

    return {"source_url": url, "source_name": source, "facts": facts}


async def get_or_extract_facts(
    keyword: str,
    related_news: list[dict],
) -> list[dict]:
    """
    keyword × source_url 기준 article_fact 캐시 확인.
    캐시 없는 URL만 크롤링 + GPT 추출 후 저장.
    [{source_url, source_name, facts}] 반환.
    """
    urls = [n["url"] for n in related_news if n.get("url")]
    if not urls:
        return []

    supabase = db.get_client()

    cached = (
        supabase.table("article_fact")
        .select("source_url, source_name, facts")
        .eq("keyword", keyword)
        .in_("source_url", urls)
        .execute()
    ).data or []
    cached_urls = {r["source_url"] for r in cached}

    missing = [n for n in related_news if n.get("url") and n["url"] not in cached_urls]

    if missing:
        results = await asyncio.gather(*[
            _process_one(keyword, n, supabase) for n in missing
        ])
        cached.extend(r for r in results if r is not None)

    return [r for r in cached if r.get("facts")]
