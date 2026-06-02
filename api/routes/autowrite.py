"""
autowrite — 기자 문체 기반 기사 초안 작성 API (reporter 전용).
M3: 미보도 트렌드 키워드 조회 + Lazy 팩트 추출.
M4: 초안 생성 (reporter_id 기반 문체 프로파일 + gpt-4o).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.lib import ai, db
from api.lib.fact_extractor import get_or_extract_facts

router = APIRouter()


@router.get("/autowrite/keywords")
async def get_unreported_keywords():
    """
    최신 배치 기준 미보도 활성 트렌드 키워드 목록.
    미보도 = matched_cluster_id IS NULL + related_news 있는 것만.
    """
    supabase = db.get_client()

    latest = (
        supabase.table("trending_keyword")
        .select("fetched_at")
        .order("fetched_at", desc=True)
        .limit(1)
        .execute()
    ).data
    if not latest:
        return {"keywords": [], "total": 0}

    latest_at = latest[0]["fetched_at"]

    rows = (
        supabase.table("trending_keyword")
        .select(
            "trending_id, keyword, search_volume, growth_rate, "
            "started_at, related_queries, related_news, fetched_at"
        )
        .eq("fetched_at", latest_at)
        .is_("matched_cluster_id", "null")
        .not_.is_("related_news", "null")
        .order("search_volume", desc=True, nullsfirst=False)
        .execute()
    ).data or []

    # related_news 빈 배열 제외
    keywords = [r for r in rows if r.get("related_news")]

    return {"keywords": keywords, "total": len(keywords)}


class FactsRequest(BaseModel):
    keyword: str
    related_news: list[dict]


@router.post("/autowrite/facts")
async def extract_facts(req: FactsRequest):
    """
    related_news URL 크롤링 + GPT gpt-4o-mini 팩트 추출 (Lazy 캐싱).
    캐시 히트 시 즉시 반환. 미스 시 크롤링 → 추출 → 저장 후 반환.
    소요 시간: 캐시 히트 <100ms, 미스 10~20초.
    """
    if not req.keyword.strip():
        raise HTTPException(status_code=400, detail="keyword 필수")
    if not req.related_news:
        raise HTTPException(status_code=400, detail="related_news 필수")

    facts = await get_or_extract_facts(req.keyword, req.related_news)

    return {
        "keyword": req.keyword,
        "facts": facts,
        "count": len(facts),
    }


# ---------------------------------------------------------------------------
# M4 — 초안 생성
# ---------------------------------------------------------------------------

_DRAFT_SYSTEM = (
    "당신은 기자의 초안 작성을 돕는 보조 도구입니다. "
    "아래 '사실 정보'만을 근거로 기사 초안을 작성하되, 지정된 기자의 문체를 따릅니다."
)

_DRAFT_RULES = (
    "[엄수 규칙]\n"
    "- 제공된 '사실 정보'에 없는 내용을 지어내지 마라. 추측·창작 금지.\n"
    "- 원문 표현을 베끼지 말고, 사실을 기자 문체로 새로 서술하라.\n"
    "- 확인이 필요한 인용·수치는 [확인필요] 표시를 남겨라.\n"
    "- 사실 근거가 약한 문장은 쓰지 마라.\n"
    "- 출력은 JSON만: {\"title\": \"제목\", \"content\": \"본문\"}"
)

_DRAFT_RULES_NO_PROFILE = (
    "[엄수 규칙]\n"
    "- 제공된 '사실 정보'에 없는 내용을 지어내지 마라. 추측·창작 금지.\n"
    "- 확인이 필요한 인용·수치는 [확인필요] 표시를 남겨라.\n"
    "- 역피라미드 구조로 작성하라.\n"
    "- 출력은 JSON만: {\"title\": \"제목\", \"content\": \"본문\"}"
)


def _build_facts_text(facts: list[dict]) -> str:
    lines = []
    for f in facts:
        d = f.get("facts", {})
        if d.get("summary"):
            lines.append(f"[요약] {d['summary']}")
        if d.get("what"):
            lines.append(f"[사건] {d['what']}")
        if d.get("when"):
            lines.append(f"[시점] {d['when']}")
        if d.get("figures"):
            for fig in d["figures"]:
                lines.append(f"[수치] {fig.get('label','')} {fig.get('value','')} (출처: {fig.get('source','')})")
        if d.get("quotes"):
            for q in d["quotes"]:
                lines.append(f"[인용] {q.get('speaker','')} — {q.get('text','')} (출처: {q.get('source','')})")
        if d.get("background"):
            lines.append(f"[배경] {d['background']}")
    return "\n".join(lines) if lines else "팩트 정보 없음"


class DraftRequest(BaseModel):
    keyword: str
    user_id: str
    reporter_id: str | None = None  # 없으면 팩트만으로 작성
    related_news: list[dict]


@router.post("/autowrite/draft")
async def create_draft(req: DraftRequest):
    """
    팩트 추출(캐시) + 문체 프로파일(있으면) → gpt-4o 초안 생성 → article_draft 저장.
    소요 시간: 20~40초 (gpt-4o 호출).
    """
    if not req.keyword.strip():
        raise HTTPException(status_code=400, detail="keyword 필수")

    supabase = db.get_client()

    # 팩트 조회 (캐시 우선)
    facts = await get_or_extract_facts(req.keyword, req.related_news)
    if not facts:
        raise HTTPException(status_code=422, detail="팩트를 추출할 수 없습니다. 관련 기사 본문을 수집하지 못했습니다.")

    facts_text = _build_facts_text(facts)
    used_facts = [{"source_url": f.get("source_url"), "source_name": f.get("source_name"), "facts": f.get("facts")} for f in facts]

    # 문체 프로파일 조회
    profile_row = None
    if req.reporter_id:
        profile_result = (
            supabase.table("reporter_style_profile")
            .select("profile, sample_articles, reporter_name")
            .eq("reporter_id", req.reporter_id)
            .limit(1)
            .execute()
        ).data
        if profile_result:
            profile_row = profile_result[0]

    # 프롬프트 구성
    import json as _json
    if profile_row:
        profile_json = _json.dumps(profile_row.get("profile") or {}, ensure_ascii=False)
        samples = profile_row.get("sample_articles") or []
        sample_text = "\n\n".join(
            f"[제목] {s.get('title','')}\n{s.get('body','')}" for s in samples[:3]
        )
        user = (
            f"{_DRAFT_RULES}\n\n"
            f"[키워드] {req.keyword}\n"
            f"[기자 문체 프로파일]\n{profile_json}\n"
            f"[문체 참고 예시 — 톤·구성만 참고, 표현 복제 금지]\n{sample_text}\n"
            f"[사실 정보]\n{facts_text}"
        )
    else:
        user = (
            f"{_DRAFT_RULES_NO_PROFILE}\n\n"
            f"[키워드] {req.keyword}\n"
            f"[사실 정보]\n{facts_text}"
        )

    try:
        raw, model_used = await ai.chat_completion(
            [
                {"role": "system", "content": _DRAFT_SYSTEM},
                {"role": "user", "content": user},
            ],
            model="gpt-4o",
            temperature=0.4,
            response_format_json=True,
        )
        result = ai._extract_json(raw)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"초안 생성 실패: {e}")

    title = result.get("title", "").strip()
    content = result.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=502, detail="초안 생성 결과가 비어 있습니다.")

    # article_draft 저장 (reporter_id NOT NULL — 프로파일 없으면 빈 문자열)
    draft_row = (
        supabase.table("article_draft")
        .insert({
            "user_id": req.user_id,
            "reporter_id": req.reporter_id or "",
            "keyword": req.keyword,
            "title": title,
            "content": content,
            "used_facts": used_facts,
            "status": "draft",
        })
        .execute()
    ).data
    draft_id = draft_row[0]["id"] if draft_row else None

    return {
        "draft_id": draft_id,
        "keyword": req.keyword,
        "title": title,
        "content": content,
        "used_facts": used_facts,
        "used_profile": profile_row is not None,
    }
