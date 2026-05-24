"use server";

import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getSupabase } from "@/lib/supabase";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function loginWithPassword(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { ok: false, error: "이메일과 비밀번호를 입력해주세요." };
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  // profiles 조회 (service role — 본인 외 row 조회 가능 + 미가입 사용자 구분)
  const admin = getSupabase();
  const { data: profile } = await admin
    .from("profiles")
    .select("approved, role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return { ok: false, error: "가입 정보가 없습니다. 가입 페이지에서 가입을 완료해주세요." };
  }

  if (!profile.approved) {
    await supabase.auth.signOut();
    redirect("/signup/pending");
  }

  redirect("/");
}

export async function signOutAction() {
  const supabase = await getSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
