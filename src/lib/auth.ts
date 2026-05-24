import { headers } from "next/headers";
import { getSupabaseServer } from "./supabase-server";
import { getSupabase } from "./supabase";
import type { Role } from "./roles";

export type CurrentProfile = {
  user_id: string;
  email: string;
  name: string;
  role: Role;
  approved: boolean;
};

// 빠른 경로: middleware 가 set 한 request header 에서 읽기 (DB 조회 0)
// middleware 가 모든 보호된 경로에서 fresh profile 검증 후 header 전파.
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const h = await headers();
  const userId = h.get("x-user-id");
  if (!userId) return null;

  return {
    user_id: userId,
    email: h.get("x-user-email") ?? "",
    name: decodeURIComponent(h.get("x-user-name") ?? ""),
    role: (h.get("x-user-role") ?? "reporter") as Role,
    approved: true, // middleware 가 approved=false 면 /signup/pending 으로 redirect
  };
}

// 보안 경로: DB 에서 직접 조회 (Server Action 등 민감한 작업용)
export async function getCurrentProfileFromDb(): Promise<CurrentProfile | null> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getSupabase();
  const { data } = await admin
    .from("profiles")
    .select("user_id, email, name, role, approved")
    .eq("user_id", user.id)
    .maybeSingle();

  return (data as CurrentProfile | null) ?? null;
}
