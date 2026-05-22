"""해외 사설 → 한국어 번역 모듈.

- 모델: gpt-4o-mini (FOREIGN_TRANSLATE_MODEL 환경변수로 override 가능)
- JSON mode 로 title_ko / body_ko 응답 강제
- 영어/일본어 → 한국어 (source_language='en' | 'ja')
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from typing import Optional, TypedDict

import httpx


class TranslationResult(TypedDict):
    title_ko: Optional[str]
    body_ko: Optional[str]
    ai_meta: dict


LANG_LABEL = {"en": "English", "ja": "Japanese"}


def _build_system_prompt(source_language: str) -> str:
    lang = LANG_LABEL.get(source_language, source_language)
    return (
        f"You are a professional translator who translates newspaper editorials from {lang} into Korean. "
        "Translate the given title and body faithfully into natural, fluent Korean suitable for a news editor "
        "to skim. Keep proper nouns recognizable (use Korean transliteration when possible, otherwise keep the "
        "original term in parentheses). Do not omit content. Do not summarize. Do not add commentary.\n\n"
        "Respond with a single JSON object exactly in this shape:\n"
        '{ "title_ko": "...", "body_ko": "..." }\n'
        "No extra keys, no markdown fences, no surrounding text."
    )


async def translate_article(
    title: str,
    body: Optional[str],
    source_language: str,
    *,
    model: Optional[str] = None,
    max_retries: int = 3,
) -> TranslationResult:
    """Translate title + body to Korean. Returns (title_ko, body_ko, ai_meta)."""
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("AI_GATEWAY_API_KEY")
    base_url = os.getenv("AI_BASE_URL", "https://api.openai.com/v1")
    use_model = model or os.getenv("FOREIGN_TRANSLATE_MODEL", "gpt-4o-mini")

    if not api_key or api_key.startswith("PLACEHOLDER"):
        return {"title_ko": None, "body_ko": None, "ai_meta": {"error": "no_api_key"}}

    user_payload = json.dumps(
        {"title": title, "body": body or ""},
        ensure_ascii=False,
    )

    async with httpx.AsyncClient() as client:
        for attempt in range(max_retries):
            try:
                resp = await client.post(
                    f"{base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": use_model,
                        "messages": [
                            {"role": "system", "content": _build_system_prompt(source_language)},
                            {"role": "user", "content": user_payload},
                        ],
                        "temperature": 0.2,
                        "response_format": {"type": "json_object"},
                    },
                    timeout=60.0,
                )
                resp.raise_for_status()
                data = resp.json()
                raw = data["choices"][0]["message"]["content"]
                parsed = json.loads(raw)
                usage = data.get("usage", {})
                return {
                    "title_ko": parsed.get("title_ko"),
                    "body_ko": parsed.get("body_ko"),
                    "ai_meta": {
                        "model": use_model,
                        "prompt_tokens": usage.get("prompt_tokens"),
                        "completion_tokens": usage.get("completion_tokens"),
                        "total_tokens": usage.get("total_tokens"),
                        "source_language": source_language,
                    },
                }
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429 and attempt < max_retries - 1:
                    wait = 30 * (attempt + 1)
                    print(f"  [translate] rate limit, {wait}s 대기 ({attempt+1}/{max_retries})", file=sys.stderr)
                    await asyncio.sleep(wait)
                    continue
                print(f"  [translate] HTTP error: {e}", file=sys.stderr)
                return {"title_ko": None, "body_ko": None, "ai_meta": {"error": str(e)}}
            except Exception as e:
                print(f"  [translate] error: {type(e).__name__}: {e}", file=sys.stderr)
                import traceback
                traceback.print_exc(file=sys.stderr)
                return {"title_ko": None, "body_ko": None, "ai_meta": {"error": f"{type(e).__name__}: {e}"}}

    return {"title_ko": None, "body_ko": None, "ai_meta": {"error": "retries_exhausted"}}
