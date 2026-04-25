import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
}

const serverKey =
  serviceRoleKey && !serviceRoleKey.startsWith("PLACEHOLDER")
    ? serviceRoleKey
    : anonKey;

if (!serverKey) {
  throw new Error(
    "Supabase key is not set (SUPABASE_SERVICE_ROLE_KEY 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY)"
  );
}

let cached: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (cached) return cached;
  cached = createClient<Database>(url!, serverKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
