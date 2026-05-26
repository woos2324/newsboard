"use server";

import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getSupabase } from "@/lib/supabase";
import { isAllowedEmail } from "@/lib/roles";
import { getMissingPasswordRequirements } from "@/lib/password";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function requestResetOtp(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") || "").trim().toLowerCase();

  if (!email) return { ok: false, error: "이메일을 입력해주세요." };
  if (!isAllowedEmail(email)) {
    return { ok: false, error: "@segye.com 이메일만 사용 가능합니다." };
  }

  const admin = getSupabase();
  const { data: existing } = await admin
    .from("profiles")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();

  if (!existing) {
    return { ok: false, error: "가입되지 않은 이메일입니다." };
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    if (error.message.includes("you can only request this after")) {
      const seconds = error.message.match(/(\d+) seconds/)?.[1];
      return { ok: false, error: `요청이 너무 잦습니다. ${seconds ? `${seconds}초` : "잠시"} 후 다시 시도해주세요.` };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function verifyResetOtp(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const token = String(formData.get("token") || "").trim();

  if (!email || !token) return { ok: false, error: "이메일과 인증 코드를 모두 입력해주세요." };

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) return { ok: false, error: "인증 코드가 올바르지 않거나 만료되었습니다." };
  return { ok: true };
}

export async function updatePassword(formData: FormData): Promise<ActionResult> {
  const password = String(formData.get("password") || "");

  const missing = getMissingPasswordRequirements(password);
  if (missing.length > 0) {
    return { ok: false, error: `비밀번호 조건을 확인해주세요. 누락: ${missing.join(", ")}` };
  }

  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "세션이 만료됐습니다. 처음부터 다시 시도해주세요." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };

  // 비밀번호 변경 후 전체 세션 무효화
  const admin = getSupabase();
  await admin.auth.admin.signOut(user.id, "global").catch(() => {});

  redirect("/login");
}
