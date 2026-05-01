import { getArticleList } from "@/lib/queries";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PER_PAGE = 10;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const date = searchParams.get("date") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const data = await getArticleList(date, page, PER_PAGE);
  return NextResponse.json(data);
}
