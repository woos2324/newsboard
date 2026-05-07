from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = PROJECT_ROOT / ".env.local"

if ENV_PATH.exists():
    load_dotenv(ENV_PATH, override=False)


def _is_jwt(key: str) -> bool:
    # supabase-py 2.10.0 은 JWT(eyJ...) 포맷만 받음 (sb_publishable_* 미지원)
    return key.startswith("eyJ")


def _resolve_key() -> str:
    service = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if service and not service.startswith("PLACEHOLDER") and _is_jwt(service):
        return service

    raise RuntimeError(
        "SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 없습니다. "
        "RLS 활성화 후 서버/배치는 service_role 키로만 Supabase 에 접근해야 합니다."
    )


@lru_cache(maxsize=1)
def get_client() -> Client:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    if not url:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL 이 .env.local 에 없습니다")
    return create_client(url, _resolve_key())


def list_media(
    only_with_naver_id: bool = True, names: list[str] | None = None
) -> list[dict]:
    sb = get_client()
    rows = (
        sb.table("media_company")
        .select(
            "media_company_id, name, normalized_name, naver_media_id, is_our_company, is_active"
        )
        .eq("is_active", True)
        .execute()
        .data
    )
    if names:
        rows = [r for r in rows if r["normalized_name"] in names]
    if only_with_naver_id:
        rows = [r for r in rows if r.get("naver_media_id")]
    return rows
