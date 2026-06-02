import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TAGS = ["traffic", "trending", "dashboard", "compare", "articles"] as const;

export async function GET(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get("tag");
  if (!tag || !TAGS.includes(tag as (typeof TAGS)[number])) {
    return NextResponse.json({ error: `tag must be one of: ${TAGS.join(", ")}` }, { status: 400 });
  }
  revalidateTag(tag);
  return NextResponse.json({ revalidated: true, tag });
}
