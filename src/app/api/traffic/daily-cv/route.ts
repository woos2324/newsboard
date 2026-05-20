import { NextRequest, NextResponse } from "next/server";
import { getDailyCvHistory } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const section = searchParams.get("section") ?? "all";
  const timeDimension = searchParams.get("time_dimension") ?? "daily";
  const defaultDays = timeDimension === "daily" ? 30 : timeDimension === "weekly" ? 16 : 12;
  const days = Math.min(120, Math.max(1, parseInt(searchParams.get("days") ?? String(defaultDays))));
  const data = await getDailyCvHistory(days, section, timeDimension);
  return NextResponse.json(data);
}
