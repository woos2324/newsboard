"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfileFromDb } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import type { Role } from "@/lib/roles";

const VALID_ROLES: Role[] = ["superadmin", "admin", "business", "reporter"];

type Result = { ok: true } | { ok: false; error: string };

async function assertSuperadmin(): Promise<Result> {
  const me = await getCurrentProfileFromDb();
  if (!me || me.role !== "superadmin") {
    return { ok: false, error: "권한이 없습니다." };
  }
  return { ok: true };
}

export async function updateUserRole(userId: string, role: string): Promise<Result> {
  const auth = await assertSuperadmin();
  if (!auth.ok) return auth;

  if (!VALID_ROLES.includes(role as Role)) {
    return { ok: false, error: "올바르지 않은 역할입니다." };
  }

  const admin = getSupabase();
  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateUserApproval(userId: string, approved: boolean): Promise<Result> {
  const auth = await assertSuperadmin();
  if (!auth.ok) return auth;

  const admin = getSupabase();
  const { error } = await admin
    .from("profiles")
    .update({ approved })
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function unlockUser(userId: string): Promise<Result> {
  const auth = await assertSuperadmin();
  if (!auth.ok) return auth;

  const admin = getSupabase();
  const { error } = await admin
    .from("profiles")
    .update({ locked: false, failed_login_attempts: 0 })
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteUser(userId: string): Promise<Result> {
  const auth = await assertSuperadmin();
  if (!auth.ok) return auth;

  const admin = getSupabase();
  // profiles 는 auth.users 의 ON DELETE CASCADE 로 자동 삭제됨
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}
