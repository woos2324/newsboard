import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase-middleware";
import { getSupabase } from "@/lib/supabase";
import { canAccessPath, INACTIVITY_LIMIT_MS, isPublicPath, type Role } from "@/lib/roles";

const LAST_ACTIVITY_COOKIE = "newsboard_last_activity";
const ACTIVITY_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

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

  if (!user) {
    if (isPublicPath(pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const lastActivityStr = request.cookies.get(LAST_ACTIVITY_COOKIE)?.value;
  const lastActivity = lastActivityStr ? parseInt(lastActivityStr, 10) : NaN;
  const now = Date.now();

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

  const admin = getSupabase();
  const { data: profile } = await admin
    .from("profiles")
    .select("name, role, approved")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
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

  // profile 정보를 request header 로 전파 → AppShell/page 에서 재조회 없이 사용
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", user.id);
  requestHeaders.set("x-user-email", user.email ?? "");
  requestHeaders.set("x-user-name", encodeURIComponent(profile.name));
  requestHeaders.set("x-user-role", profile.role);

  const finalResponse = NextResponse.next({ request: { headers: requestHeaders } });
  // Supabase 가 갱신한 auth 쿠키 보존
  response.cookies.getAll().forEach((c) => {
    finalResponse.cookies.set(c.name, c.value, c);
  });

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
