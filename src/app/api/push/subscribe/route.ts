import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint, keys } = await req.json();
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const admin = getSupabase();
  await admin
    .from("push_subscription")
    .upsert(
      { user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: "endpoint" }
    );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint } = await req.json();
  const admin = getSupabase();
  await admin
    .from("push_subscription")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
