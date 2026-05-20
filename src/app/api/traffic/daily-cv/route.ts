import { NextRequest, NextResponse } from "next/server";
import { getDailyCvHistory } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const section = searchParams.get("section") ?? "all";
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") ?? "30")));
  const data = await getDailyCvHistory(days, section);
  return NextResponse.json(data);
}
