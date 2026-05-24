import { cache } from "react";
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

// 요청당 1회 조회 (React cache)
export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => {
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

  if (!data) return null;
  return data as CurrentProfile;
});
