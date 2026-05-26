export type Role = "superadmin" | "admin" | "business" | "reporter";

export const SIGNUP_ALLOWED_ROLES = ["admin", "reporter", "business"] as const;
export type SignupRole = (typeof SIGNUP_ALLOWED_ROLES)[number];

export const ALLOWED_EMAIL_DOMAIN = "segye.com";

// 가입 시 자동 승인 여부 (reporter=true, business=false → superadmin 수동 승인)
export function isAutoApproved(role: SignupRole): boolean {
  return role === "reporter";
}

export function isAllowedEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

// 비활동 자동 로그아웃 임계값 (밀리초). 4시간.
export const INACTIVITY_LIMIT_MS = 4 * 60 * 60 * 1000;

// 비로그인 사용자도 접근 가능한 경로 (prefix 매칭)
const PUBLIC_PATHS = ["/login", "/signup"];

// 트래픽·구독자 메뉴 (사업부 전용, 기자 차단)
const BUSINESS_ONLY_PATHS = ["/traffic", "/analytics/subscribers"];

// 회원 관리 (superadmin 전용)
const SUPERADMIN_ONLY_PATHS = ["/admin"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// 역할이 해당 경로 접근 가능한지
export function canAccessPath(role: Role, pathname: string): boolean {
  // 대시보드는 모두 접근 가능
  if (pathname === "/") return true;

  // superadmin/admin 전체 접근 — 단 /admin/* 은 superadmin 만
  if (role === "superadmin") return true;
  if (role === "admin") {
    return !SUPERADMIN_ONLY_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );
  }

  // business (사업부): 트래픽 + 구독자만 + 대시보드
  if (role === "business") {
    return BUSINESS_ONLY_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );
  }

  // reporter (기자): 트래픽 + 구독자 제외 전체
  if (role === "reporter") {
    if (SUPERADMIN_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return false;
    }
    return !BUSINESS_ONLY_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );
  }

  return false;
}
