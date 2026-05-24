import { AppShell } from "@/components/AppShell";
import { getSupabase } from "@/lib/supabase";
import { UsersTable } from "./UsersTable";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const admin = getSupabase();
  const { data: users } = await admin
    .from("profiles")
    .select("user_id, email, name, role, approved, created_at, updated_at")
    .order("approved", { ascending: true })
    .order("created_at", { ascending: false });

  const list = users ?? [];
  const pendingCount = list.filter((u) => !u.approved).length;

  return (
    <AppShell>
      <main className="flex-1 px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">회원 관리</h1>
          <p className="mt-1 text-sm text-muted">
            가입자 목록 · 승인 · 역할 변경 · 삭제 (superadmin 전용)
          </p>
        </div>

        {pendingCount > 0 && (
          <div className="mb-4 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
            <span className="font-medium text-warning">{pendingCount}명</span>{" "}
            <span className="text-foreground/80">의 사용자가 승인 대기 중입니다.</span>
          </div>
        )}

        <UsersTable users={list} />
      </main>
    </AppShell>
  );
}
