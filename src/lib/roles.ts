export type Role = "superadmin" | "admin" | "business" | "reporter";

export const SIGNUP_ALLOWED_ROLES = ["reporter", "business"] as const;
export type SignupRole = (typeof SIGNUP_ALLOWED_ROLES)[number];

export const ALLOWED_EMAIL_DOMAIN = "segye.com";

// 가입 시 자동 승인 여부 (reporter=true, business=false → superadmin 수동 승인)
export function isAutoApproved(role: SignupRole): boolean {
  return role === "reporter";
}

export function isAllowedEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}
