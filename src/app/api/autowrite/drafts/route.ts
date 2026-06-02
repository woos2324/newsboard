import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getCurrentProfile } from "@/lib/auth";

// 본인 초안 목록 조회 (keyword 기준 필터 선택)
export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyword = req.nextUrl.searchParams.get("keyword");
  const supabase = getSupabase();

  let query = supabase
    .from("article_draft")
    .select("id, keyword, title, status, created_at")
    .eq("user_id", profile.user_id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (keyword) {
    query = query.eq("keyword", keyword);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ drafts: data ?? [] });
}
