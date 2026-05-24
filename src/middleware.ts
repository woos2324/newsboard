import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase-middleware";
import { getSupabase } from "@/lib/supabase";
import { canAccessPath, INACTIVITY_LIMIT_MS, isPublicPath, type Role } from "@/lib/roles";

const LAST_ACTIVITY_COOKIE = "newsboard_last_activity";
// 활동 시각 쿠키는 5분마다만 갱신 (매 요청마다 쓰면 RSC 응답 깨짐)
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

  // RSC prefetch / soft navigation 요청은 응답 본문을 가공하면 multipart 가 깨짐
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
    .select("role, approved")
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

  // 활동 시각 갱신 — RSC 요청 제외 + 5분에 한 번만 (응답 본문 보호)
  const shouldUpdateActivity =
    !isRSC && (Number.isNaN(lastActivity) || now - lastActivity > ACTIVITY_UPDATE_INTERVAL_MS);
  if (shouldUpdateActivity) {
    response.cookies.set(LAST_ACTIVITY_COOKIE, now.toString(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
