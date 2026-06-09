"use server";

import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getSupabase } from "@/lib/supabase";

type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_FAILED_ATTEMPTS = 5;
const LOCKED_MESSAGE =
  "로그인 5회 실패로 계정이 잠겼습니다. 관리자에게 잠금 해제를 요청해주세요.";

export async function loginWithPassword(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { ok: false, error: "이메일과 비밀번호를 입력해주세요." };
  }

  // 인증 전 이메일로 잠금 상태 확인 (service role)
  const admin = getSupabase();
  const { data: lockProfile } = await admin
    .from("profiles")
    .select("user_id, role, failed_login_attempts, locked")
    .eq("email", email)
    .maybeSingle();

  // superadmin 은 락아웃 대상에서 제외 (마지막 관리자 영구 잠금 방지)
  const lockable = lockProfile && lockProfile.role !== "superadmin";

  if (lockProfile?.locked && lockable) {
    return { ok: false, error: LOCKED_MESSAGE };
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // 실패 카운트 증가 → 5회 도달 시 잠금
    if (lockProfile && lockable) {
      const attempts = (lockProfile.failed_login_attempts ?? 0) + 1;
      const willLock = attempts >= MAX_FAILED_ATTEMPTS;
      await admin
        .from("profiles")
        .update({ failed_login_attempts: attempts, locked: willLock })
        .eq("user_id", lockProfile.user_id);
      if (willLock) {
        return { ok: false, error: LOCKED_MESSAGE };
      }
    }
    return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  // profiles 조회 (service role — 본인 외 row 조회 가능 + 미가입 사용자 구분)
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

  // 로그인 성공 → 실패 카운트 초기화
  await admin
    .from("profiles")
    .update({ failed_login_attempts: 0, locked: false })
    .eq("user_id", data.user.id);

  redirect(profile.role === "business" ? "/traffic" : "/");
}

export async function signOutAction() {
  const supabase = await getSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
