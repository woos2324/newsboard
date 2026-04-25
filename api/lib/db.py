import os
from functools import lru_cache

from supabase import Client, create_client


def _is_jwt(key: str) -> bool:
    # supabase-py 2.10.0 은 JWT(eyJ...) 포맷만 받음 (sb_publishable_* 미지원)
    return key.startswith("eyJ")


def _resolve_key() -> str:
    service = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if service and not service.startswith("PLACEHOLDER") and _is_jwt(service):
        return service

    legacy = os.environ.get("SUPABASE_LEGACY_ANON_KEY", "")
    if legacy and _is_jwt(legacy):
        return legacy

    anon = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    if anon and _is_jwt(anon):
        return anon

    raise RuntimeError(
        "Supabase JWT key 가 환경변수에 없습니다. "
        "supabase-py 는 JWT 포맷만 지원하므로 SUPABASE_LEGACY_ANON_KEY 또는 "
        "JWT 형식의 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다."
    )


@lru_cache(maxsize=1)
def get_client() -> Client:
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    return create_client(url, _resolve_key())
