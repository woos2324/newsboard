import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { ArticlePvItem } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const date    = searchParams.get("date") ?? "";
  const device  = searchParams.get("device") ?? "all";
  const section = searchParams.get("section") ?? "all";

  if (!date) return NextResponse.json([]);

  const sb = getSupabase();
  const { data } = await sb
    .from("article_pv_snapshot")
    .select("rank, title, reporter_name, pv, category, article_published_at, article_id, article_url")
    .eq("data_date", date)
    .eq("device", device)
    .eq("category", section)
    .eq("time_dimension", "daily")
    .order("rank", { ascending: true })
    .limit(100);

  const articles: ArticlePvItem[] = (data ?? []).map((r) => ({
    rank: r.rank,
    title: r.title,
    reporter_name: r.reporter_name,
    pv: r.pv,
    category: r.category,
    article_published_at: r.article_published_at,
    article_id: r.article_id,
    article_url: r.article_url,
  }));

  return NextResponse.json(articles);
}
