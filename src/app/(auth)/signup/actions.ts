"use server";

import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getSupabase } from "@/lib/supabase";
import {
  ALLOWED_EMAIL_DOMAIN,
  isAllowedEmail,
  isAutoApproved,
  SIGNUP_ALLOWED_ROLES,
  type SignupRole,
} from "@/lib/roles";
import { getMissingPasswordRequirements } from "@/lib/password";
import { notifySuperadmins } from "@/lib/push";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function requestSignupOtp(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") || "").trim().toLowerCase();

  if (!email) return { ok: false, error: "이메일을 입력해주세요." };
  if (!isAllowedEmail(email)) {
    return { ok: false, error: `@${ALLOWED_EMAIL_DOMAIN} 이메일만 가입 가능합니다.` };
  }

  const admin = getSupabase();
  const { data: existing } = await admin
    .from("profiles")
    .select("user_id, approved")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    if (!existing.approved) redirect("/signup/pending");
    return { ok: false, error: "이미 가입된 이메일입니다. 로그인 페이지를 이용해주세요." };
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function verifySignupOtp(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const token = String(formData.get("token") || "").trim();

  if (!email || !token) return { ok: false, error: "이메일과 인증 코드를 모두 입력해주세요." };

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) return { ok: false, error: "인증 코드가 올바르지 않거나 만료되었습니다." };
  return { ok: true };
}

export async function completeSignup(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "").trim() as SignupRole;
  const password = String(formData.get("password") || "");

  if (!name) return { ok: false, error: "이름을 입력해주세요." };
  if (!SIGNUP_ALLOWED_ROLES.includes(role)) {
    return { ok: false, error: "역할을 선택해주세요." };
  }
  const missingPasswordRequirements = getMissingPasswordRequirements(password);
  if (missingPasswordRequirements.length > 0) {
    return {
      ok: false,
      error: `비밀번호 조건을 확인해주세요. 누락: ${missingPasswordRequirements.join(", ")}`,
    };
  }

  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "세션이 만료되었습니다. 처음부터 다시 시도해주세요." };
  }

  // updateUser(비밀번호)와 profiles INSERT는 독립적 → 병렬 실행
  const admin = getSupabase();
  const [{ error: pwError }, { error: profileError }] = await Promise.all([
    supabase.auth.updateUser({ password }),
    admin.from("profiles").insert({
      user_id: user.id,
      email: user.email!,
      name,
      role,
      approved: isAutoApproved(role),
    }),
  ]);

  if (pwError) return { ok: false, error: pwError.message };

  if (profileError) {
    // 이미 INSERT 된 경우 (재진입) 무시
    if (profileError.code !== "23505") {
      return { ok: false, error: profileError.message };
    }
  }

  // business/admin 가입 시 superadmin에게 push 알림 발송 (승인 필요)
  if (role === "business" || role === "admin") {
    const roleLabel = role === "admin" ? "관리자" : "사업부";
    notifySuperadmins({
      title: "새 가입 신청",
      body: `${name}님이 ${roleLabel} 권한으로 가입을 신청했습니다. 승인이 필요합니다.`,
      url: "/admin/users",
    }).catch(() => {});
  }

  return { ok: true };
}
