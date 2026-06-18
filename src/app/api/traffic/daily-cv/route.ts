import { NextRequest, NextResponse } from "next/server";
import { getDailyCvHistory } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const section = searchParams.get("section") ?? "all";
  const timeDimension = searchParams.get("time_dimension") ?? "daily";
  const days = Math.min(120, Math.max(1, parseInt(searchParams.get("days") ?? "7")));
  const data = await getDailyCvHistory(days, section, timeDimension);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
