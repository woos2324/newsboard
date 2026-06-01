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

# 언어별 모델 매핑 — 일본어는 인명/카타카나 외래어 정확도 위해 gpt-4o, 영어는 4o-mini로 충분
LANG_MODEL = {"ja": "gpt-4o", "en": "gpt-4o-mini"}


def _build_system_prompt(source_language: str) -> str:
    lang = LANG_LABEL.get(source_language, source_language)

    # 한국 표준 외래어/인명 표기 가이드 (실제 번역 사고 사례 기반)
    if source_language == "ja":
        loc_guide = (
            "## 한국어 표기 규칙 (중요)\n"
            "- 카타카나 외래어는 한국 표준 외래어 표기법을 따를 것. 일본어 발음 직역 금지.\n"
            "  예) シャトル → 셔틀 (×샤틀), ホワイトハウス → 백악관, ホルムズ → 호르무즈, トランプ → 트럼프\n"
            "- 일본 인명은 일본어 음독을 한국어 한글로 정확히 표기. 한자 음을 한국 한자음으로 읽지 말 것.\n"
            "  예) 高市早苗 → 다카이치 사나에 (×고이치), 岸田文雄 → 기시다 후미오, 石破茂 → 이시바 시게루,\n"
            "      安倍晋三 → 아베 신조, 河野太郎 → 고노 다로\n"
            "- 한국 인명은 한국어 발음으로: 李在明 → 이재명, 尹錫悦 → 윤석열\n"
            "- 중국 인명은 한자 한국어 음독 또는 통용 표기: 習近平 → 시진핑, 王毅 → 왕이\n"
            "- 지명·기관명은 한국 통용 표기: 安東 → 안동(경북), 北京 → 베이징, 上海 → 상하이\n"
            "- 불확실한 외래어는 (원어 병기): 예) 신타시야(信達雅)\n\n"
        )
    else:
        loc_guide = (
            "## 한국어 표기 규칙\n"
            "- 인명·지명·외래어는 한국 통용 표기법을 따를 것 (Trump → 트럼프, Biden → 바이든, Washington → 워싱턴).\n"
            "- 약어는 한국에서 통용되는 형태로 (NATO → 나토, EU → EU, UN → 유엔).\n\n"
        )

    return (
        f"You are a professional translator who translates newspaper editorials from {lang} into Korean. "
        "Translate the given title and body faithfully into natural, fluent Korean suitable for a news editor "
        "to skim. Do not omit content. Do not summarize. Do not add commentary.\n\n"
        f"{loc_guide}"
        "## 응답 형식\n"
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
    max_retries: int = 5,
) -> TranslationResult:
    """Translate title + body to Korean. Returns (title_ko, body_ko, ai_meta).

    모델 우선순위:
      1) 호출 시 model 인자
      2) FOREIGN_TRANSLATE_MODEL 환경변수 (모든 언어 강제)
      3) LANG_MODEL 매핑 (ja=gpt-4o, en=gpt-4o-mini)
    """
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("AI_GATEWAY_API_KEY")
    base_url = os.getenv("AI_BASE_URL", "https://api.openai.com/v1")
    use_model = (
        model
        or os.getenv("FOREIGN_TRANSLATE_MODEL")
        or LANG_MODEL.get(source_language, "gpt-4o-mini")
    )

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
                    wait = min(30 * (2 ** attempt), 480)
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
