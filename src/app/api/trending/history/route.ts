import { NextRequest, NextResponse } from "next/server";
import { getTrendingHistory } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get("keyword");
  const hours = Number(req.nextUrl.searchParams.get("hours") ?? "6");
  if (!keyword) return NextResponse.json([], { status: 400 });

  try {
    const data = await getTrendingHistory(keyword, hours);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
