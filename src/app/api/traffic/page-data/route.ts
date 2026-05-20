import { NextRequest, NextResponse } from "next/server";
import { getTrafficPageData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const date   = searchParams.get("date") ?? "";
  const device = searchParams.get("device") ?? "all";
  if (!date) return NextResponse.json(null, { status: 400 });
  const data = await getTrafficPageData(date, 100, 100, device);
  return NextResponse.json(data);
}
