import json
import os
import re
from typing import Any

import httpx

# 기본은 Vercel AI Gateway. AI_BASE_URL 환경변수로 OpenAI 직접 호출 등으로 전환 가능.
GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1"


def _resolve_base_url() -> str:
    return os.environ.get("AI_BASE_URL", GATEWAY_BASE).rstrip("/")


def _is_openai_direct() -> bool:
    return "openai.com" in _resolve_base_url()


def _resolve_api_key() -> str:
    """AI_GATEWAY_API_KEY 우선, 없으면 OPENAI_API_KEY 폴백."""
    for name in ("AI_GATEWAY_API_KEY", "OPENAI_API_KEY"):
        key = os.environ.get(name, "")
        if key and not key.startswith("PLACEHOLDER"):
            return key
    raise RuntimeError(
        "AI API 키가 설정되지 않았습니다. .env.local 에 "
        "AI_GATEWAY_API_KEY (Vercel AI Gateway) 또는 "
        "OPENAI_API_KEY (OpenAI 직접 호출) 를 주입하세요."
    )


def _resolve_chat_model(model: str | None) -> str:
    if model:
        return model
    explicit = os.environ.get("DEFAULT_AI_MODEL")
    if explicit:
        return explicit
    # 기본값: AI Gateway 면 anthropic/claude-opus-4-6, OpenAI 직접이면 gpt-4o-mini
    return "gpt-4o-mini" if _is_openai_direct() else "anthropic/claude-opus-4-6"


def _resolve_embed_model(model: str | None) -> str:
    if model:
        return model
    explicit = os.environ.get("DEFAULT_EMBED_MODEL")
    if explicit:
        return explicit
    return (
        "text-embedding-3-small"
        if _is_openai_direct()
        else "openai/text-embedding-3-small"
    )


async def chat_completion(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.3,
    response_format_json: bool = False,
) -> tuple[str, str]:
    """Chat completion via AI Gateway / OpenAI. Returns (content, model_used)."""
    api_key = _resolve_api_key()
    base = _resolve_base_url()
    model_id = _resolve_chat_model(model)

    payload: dict[str, Any] = {
        "model": model_id,
        "messages": messages,
        "temperature": temperature,
    }
    if response_format_json:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{base}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"], model_id


def _extract_json(raw: str) -> dict:
    """모델이 markdown 코드펜스로 감싸거나 앞뒤에 텍스트를 붙인 경우도 대응."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        raise ValueError(f"JSON 추출 실패: {raw[:200]}")
    return json.loads(match.group(0))


async def generate_daily_briefing(
    clusters: list[dict],
) -> tuple[dict, str]:
    """이슈 클러스터 리스트 -> {title, summary, bullets} + model_version.

    bullets 각 항목은 {text, cluster_index} 형태로 반환됨.
    cluster_index 는 입력 clusters 배열의 0-based 인덱스.
    """
    if not clusters:
        raise ValueError("clusters 가 비어 있음")

    cluster_lines = []
    for i, c in enumerate(clusters):
        kw = ", ".join(c.get("keywords") or [])
        cluster_lines.append(
            f"[{i}] [{c.get('representative_title')}] "
            f"(기사 {c.get('article_count', 0)}건, 키워드: {kw}): "
            f"{c.get('summary') or ''}"
        )
    clusters_text = "\n".join(cluster_lines)

    system = (
        "당신은 뉴스룸 편집자를 위한 AI 일간 브리핑 어시스턴트다. "
        "출력은 항상 JSON 객체 하나로만 반환한다."
    )
    user = (
        "아래는 오늘의 주요 이슈 클러스터 목록이다. (각 클러스터는 [인덱스]로 식별)\n"
        "편집자를 위한 일간 브리핑을 한국어 JSON 으로 작성하라.\n\n"
        "출력 JSON 스키마:\n"
        '{ "title": "...", "summary": "2-3문장 개관", '
        '"bullets": [{"text": "핵심 포인트", "cluster_index": 0}, ...] }\n\n'
        "규칙:\n"
        "- summary 는 2-3문장, 전체 흐름을 짚는다.\n"
        "- bullets 는 3-5개, 각 bullet 은 한 문장.\n"
        "- 각 bullet 의 cluster_index 는 해당 내용이 주로 근거한 클러스터의 인덱스.\n"
        "- title 은 20자 이내로 오늘을 대표하는 카피.\n"
        "- JSON 외 텍스트/마크다운 금지.\n\n"
        f"클러스터 목록:\n{clusters_text}"
    )

    raw, model_used = await chat_completion(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format_json=True,
    )
    return _extract_json(raw), model_used


async def embed(
    texts: list[str],
    model: str | None = None,
) -> tuple[list[list[float]], str]:
    """Embedding via AI Gateway / OpenAI. Returns (embeddings, model_used)."""
    if not texts:
        return [], ""
    api_key = _resolve_api_key()
    base = _resolve_base_url()
    model_id = _resolve_embed_model(model)

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{base}/embeddings",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"model": model_id, "input": texts},
        )
        resp.raise_for_status()
        data = resp.json()
        rows = sorted(data["data"], key=lambda x: x["index"])
        return [r["embedding"] for r in rows], model_id


async def generate_cluster_metadata(
    titles: list[str],
) -> tuple[dict, str]:
    """같은 이슈로 묶인 기사 제목 리스트 -> {title, summary, keywords} + model."""
    if not titles:
        raise ValueError("titles 가 비어 있음")

    titles_text = "\n".join(f"- {t}" for t in titles)
    system = (
        "당신은 뉴스 이슈 클러스터에 대표 메타데이터를 붙이는 AI 다. "
        "출력은 항상 JSON 객체 하나로만 반환한다."
    )
    user = (
        "아래는 같은 이슈로 묶인 기사 제목들이다. "
        "이 이슈의 대표 메타데이터를 한국어 JSON 으로 작성하라.\n\n"
        "출력 JSON 스키마:\n"
        '{ "title": "...", "summary": "2-3문장", '
        '"keywords": ["키워드1", "키워드2", "키워드3"] }\n\n'
        "규칙:\n"
        "- title: 20자 이내, 이슈를 대표하는 한 줄.\n"
        "- summary: 2-3문장으로 이슈 핵심.\n"
        "- keywords: 3-5개, 핵심 명사 중심.\n"
        "- JSON 외 텍스트/마크다운 금지.\n\n"
        f"기사 제목:\n{titles_text}"
    )

    raw, model_used = await chat_completion(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format_json=True,
    )
    return _extract_json(raw), model_used


async def generate_issue_summary(
    cluster_title: str,
    articles: list[dict],
) -> tuple[dict, str]:
    """단일 이슈 클러스터 + 관련 기사 -> {title, summary, bullets} + model_version."""
    if not articles:
        raise ValueError("articles 가 비어 있음")

    lines = [f"- [{a.get('media', '-')}] {a.get('title', '')}" for a in articles]
    articles_text = "\n".join(lines)

    system = (
        "당신은 뉴스룸 편집자를 위한 AI 이슈 요약 어시스턴트다. "
        "출력은 항상 JSON 객체 하나로만 반환한다."
    )
    user = (
        f"이슈: {cluster_title}\n\n"
        "아래는 이 이슈에 속한 관련 기사 목록이다. "
        "편집자를 위한 이슈 요약을 한국어 JSON 으로 작성하라.\n\n"
        "출력 JSON 스키마:\n"
        '{ "title": "...", "summary": "3-4문장 개관", '
        '"bullets": ["팩트 1", "팩트 2", "시사점"] }\n\n'
        "규칙:\n"
        "- summary 는 3-4문장.\n"
        "- bullets 는 3-5개, 사실 중심.\n"
        "- JSON 외 텍스트/마크다운 금지.\n\n"
        f"관련 기사:\n{articles_text}"
    )

    raw, model_used = await chat_completion(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format_json=True,
    )
    return _extract_json(raw), model_used
