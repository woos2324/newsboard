"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

// Client Component 용 Supabase 클라이언트
// 브라우저 쿠키에 세션 토큰 저장 (서버와 공유)
export function getSupabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient<Database>(url, anonKey);
}
