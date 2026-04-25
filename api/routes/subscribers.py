from fastapi import APIRouter

from api.lib.db import get_client

router = APIRouter()


@router.get("/subscribers")
async def get_subscribers(media_company_id: int | None = None, days: int = 7) -> dict:
    sb = get_client()
    query = (
        sb.table("subscriber_snapshot")
        .select("snapshot_date, subscriber_count, daily_delta, seven_day_delta, media_company(media_company_id, name, is_our_company)")
        .order("snapshot_date", desc=True)
        .limit(days * 30)
    )
    if media_company_id is not None:
        query = query.eq("media_company_id", media_company_id)
    rows = query.execute().data

    grouped: dict[str, list[dict]] = {}
    for r in rows:
        mc = r.get("media_company") or {}
        key = mc.get("name") or "unknown"
        grouped.setdefault(key, []).append(
            {
                "snapshot_date": r["snapshot_date"],
                "subscriber_count": r["subscriber_count"],
                "daily_delta": r.get("daily_delta"),
                "seven_day_delta": r.get("seven_day_delta"),
            }
        )
    for k in grouped:
        grouped[k] = list(reversed(grouped[k][:days]))
    return {"series": grouped}
