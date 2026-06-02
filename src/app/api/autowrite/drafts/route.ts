import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSupabaseServer } from "@/lib/supabase-server";

// 본인 초안 목록 조회 (keyword 기준 필터 선택)
export async function GET(req: NextRequest) {
  // 미들웨어 헤더 대신 세션 쿠키로 직접 인증
  const supabaseAuth = await getSupabaseServer();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyword = req.nextUrl.searchParams.get("keyword");
  const db = getSupabase();

  let query = db
    .from("article_draft")
    .select("id, keyword, title, status, created_at")
    .eq("user_id", user.id)
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
