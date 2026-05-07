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

    raise RuntimeError(
        "SUPABASE_SERVICE_ROLE_KEY 가 환경변수에 없습니다. "
        "RLS 활성화 후 서버/배치는 service_role 키로만 Supabase 에 접근해야 합니다."
    )


@lru_cache(maxsize=1)
def get_client() -> Client:
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    return create_client(url, _resolve_key())
