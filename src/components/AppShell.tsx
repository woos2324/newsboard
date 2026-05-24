import { getCurrentProfile } from "@/lib/auth";
import { AppShellClient } from "@/components/AppShellClient";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  // 정상 흐름에서는 middleware 가 비로그인 사용자를 /login 으로 보내므로 이 분기는 도달하지 않음.
  // 이상 상황 (prefetch 등) 에서는 빈 화면 반환 — redirect 호출하면 호출자 응답에 묻어가
  // /login → /login 무한 루프 위험.
  if (!profile) return null;

  return <AppShellClient profile={profile}>{children}</AppShellClient>;
}
