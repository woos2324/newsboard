import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

// Server Component / Server Action / Route Handler 용 Supabase 클라이언트
// 인증 쿠키는 세션 쿠키(브라우저 종료 시 삭제) 로 발급
export async function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const { maxAge: _maxAge, expires: _expires, ...sessionOptions } = options ?? {};
            cookieStore.set(name, value, sessionOptions);
          });
        } catch {
          // Server Component 에서 호출되면 set 불가 → middleware 가 갱신 담당
        }
      },
    },
  });
}
