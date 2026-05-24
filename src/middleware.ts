import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase-middleware";
import { getSupabase } from "@/lib/supabase";
import { canAccessPath, INACTIVITY_LIMIT_MS, isPublicPath, type Role } from "@/lib/roles";

const LAST_ACTIVITY_COOKIE = "newsboard_last_activity";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 정적 자원·API·Next 내부는 matcher 에서 제외하지만 안전망
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  // 1) 세션 쿠키 갱신
  const { response, user } = await updateSupabaseSession(request);

  // 2) 비로그인 사용자 처리
  if (!user) {
    if (isPublicPath(pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 3) 로그인 사용자가 /login, /signup 접근 → 메인으로
  if (isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 4) 비활동 4시간 자동 로그아웃
  const lastActivityStr = request.cookies.get(LAST_ACTIVITY_COOKIE)?.value;
  const now = Date.now();
  if (lastActivityStr) {
    const lastActivity = parseInt(lastActivityStr, 10);
    if (!Number.isNaN(lastActivity) && now - lastActivity > INACTIVITY_LIMIT_MS) {
      const admin = getSupabase();
      await admin.auth.admin.signOut(user.id).catch(() => {});
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      const redirect = NextResponse.redirect(url);
      redirect.cookies.delete(LAST_ACTIVITY_COOKIE);
      return redirect;
    }
  }

  // 5) profile 조회 → 승인·역할 검증 (service role 사용)
  const admin = getSupabase();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, approved")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    // auth.users 만 있고 profiles 없음 (가입 도중 중단) → 로그아웃
    await admin.auth.admin.signOut(user.id).catch(() => {});
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!profile.approved) {
    const url = request.nextUrl.clone();
    url.pathname = "/signup/pending";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!canAccessPath(profile.role as Role, pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 6) 활동 시각 갱신 (세션 쿠키 — 브라우저 종료 시 삭제)
  response.cookies.set(LAST_ACTIVITY_COOKIE, now.toString(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export const config = {
  matcher: [
    // _next/, api/, 정적 파일 제외하고 모든 경로
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
