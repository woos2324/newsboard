import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase-middleware";
import { getSupabase } from "@/lib/supabase";
import { canAccessPath, INACTIVITY_LIMIT_MS, isPublicPath, type Role } from "@/lib/roles";

const LAST_ACTIVITY_COOKIE = "newsboard_last_activity";
const ACTIVITY_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

// Supabase 가 갱신한 auth 쿠키를 redirect/next 응답에 그대로 옮긴다.
// 옮기지 않으면 token refresh 직후 응답에서 새 쿠키가 누락되어 redirect 루프 위험.
function copyCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((c) => target.cookies.set(c.name, c.value, c));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  const isRSC =
    request.headers.has("rsc") || request.headers.has("next-router-state-tree");

  const { response, user } = await updateSupabaseSession(request);

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const r = NextResponse.redirect(url);
    copyCookies(r, response);
    return r;
  };

  // 1) 비로그인 사용자
  if (!user) {
    if (isPublicPath(pathname)) return response;
    return redirectTo("/login");
  }

  // 2) 로그인 사용자: /login, /signup 등 진입 시 → / 로
  //    단 /signup/pending 은 미승인 사용자가 봐야 하므로 예외
  const isOnPendingPage = pathname === "/signup/pending";
  if (isPublicPath(pathname) && !isOnPendingPage) {
    return redirectTo("/");
  }

  // 3) 비활동 4시간 자동 로그아웃
  const lastActivityStr = request.cookies.get(LAST_ACTIVITY_COOKIE)?.value;
  const lastActivity = lastActivityStr ? parseInt(lastActivityStr, 10) : NaN;
  const now = Date.now();

  if (!Number.isNaN(lastActivity) && now - lastActivity > INACTIVITY_LIMIT_MS) {
    const admin = getSupabase();
    await admin.auth.admin.signOut(user.id).catch(() => {});
    const r = redirectTo("/login");
    r.cookies.delete(LAST_ACTIVITY_COOKIE);
    return r;
  }

  // 4) profile 검증
  const admin = getSupabase();
  const { data: profile } = await admin
    .from("profiles")
    .select("name, role, approved")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    await admin.auth.admin.signOut(user.id).catch(() => {});
    return redirectTo("/login");
  }

  if (!profile.approved) {
    // 미승인 사용자: pending 페이지에서는 통과, 다른 페이지는 pending 으로
    if (!isOnPendingPage) return redirectTo("/signup/pending");
  } else if (isOnPendingPage) {
    // 승인된 사용자가 pending 페이지에 오면 / 로
    return redirectTo("/");
  } else if (!canAccessPath(profile.role as Role, pathname)) {
    // 역할이 허용하지 않는 경로
    return redirectTo("/");
  }

  // 5) header 로 profile 전파 + 활동 시각 갱신
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", user.id);
  requestHeaders.set("x-user-email", user.email ?? "");
  requestHeaders.set("x-user-name", encodeURIComponent(profile.name));
  requestHeaders.set("x-user-role", profile.role);

  const finalResponse = NextResponse.next({ request: { headers: requestHeaders } });
  copyCookies(finalResponse, response);

  const shouldUpdateActivity =
    !isRSC && (Number.isNaN(lastActivity) || now - lastActivity > ACTIVITY_UPDATE_INTERVAL_MS);
  if (shouldUpdateActivity) {
    finalResponse.cookies.set(LAST_ACTIVITY_COOKIE, now.toString(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return finalResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
