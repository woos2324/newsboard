import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
}

let cached: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (cached) return cached;
  if (!serviceRoleKey || serviceRoleKey.startsWith("PLACEHOLDER")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for server-side Supabase access"
    );
  }
  cached = createClient<Database>(url!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
