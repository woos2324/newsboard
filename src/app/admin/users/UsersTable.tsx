"use client";

import { useState, useTransition } from "react";
import { Check, LockOpen, Trash2, X } from "lucide-react";
import { deleteUser, unlockUser, updateUserApproval, updateUserRole } from "./actions";
import type { Role } from "@/lib/roles";

type UserRow = {
  user_id: string;
  email: string;
  name: string;
  role: string;
  approved: boolean;
  locked: boolean;
  failed_login_attempts: number;
  created_at: string;
  updated_at: string;
};

const ROLE_LABEL: Record<Role, string> = {
  superadmin: "최고관리자",
  admin: "관리자",
  business: "사업부",
  reporter: "기자",
};

const ROLE_BADGE: Record<Role, string> = {
  superadmin: "bg-primary-500/10 text-primary-500",
  admin: "bg-primary-500/10 text-primary-500",
  business: "bg-success/10 text-success",
  reporter: "bg-muted/10 text-muted",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function UsersTable({ users }: { users: UserRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleRoleChange(userId: string, newRole: string) {
    setError(null);
    setPendingId(userId);
    startTransition(async () => {
      const result = await updateUserRole(userId, newRole);
      setPendingId(null);
      if (!result.ok) setError(result.error);
    });
  }

  function handleApprove(userId: string, approve: boolean) {
    setError(null);
    setPendingId(userId);
    startTransition(async () => {
      const result = await updateUserApproval(userId, approve);
      setPendingId(null);
      if (!result.ok) setError(result.error);
    });
  }

  function handleUnlock(userId: string) {
    setError(null);
    setPendingId(userId);
    startTransition(async () => {
      const result = await unlockUser(userId);
      setPendingId(null);
      if (!result.ok) setError(result.error);
    });
  }

  function handleDelete(userId: string, name: string) {
    if (!confirm(`${name} 계정을 정말 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    setError(null);
    setPendingId(userId);
    startTransition(async () => {
      const result = await deleteUser(userId);
      setPendingId(null);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded border border-error/40 bg-error/5 px-3 py-2 text-sm text-error">
          {error}
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-background/50 text-xs text-muted">
            <tr>
              <th className="px-4 py-3 text-left font-medium">이름</th>
              <th className="px-4 py-3 text-left font-medium">이메일</th>
              <th className="px-4 py-3 text-left font-medium">역할</th>
              <th className="px-4 py-3 text-left font-medium">상태</th>
              <th className="px-4 py-3 text-left font-medium">가입일</th>
              <th className="px-4 py-3 text-right font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted">
                  가입한 사용자가 없습니다.
                </td>
              </tr>
            )}
            {users.map((u) => {
              const role = u.role as Role;
              const busy = pendingId === u.user_id;
              return (
                <tr key={u.user_id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-muted">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.user_id, e.target.value)}
                      disabled={busy}
                      className={`rounded border border-border bg-white px-2 py-1 text-xs font-medium ${ROLE_BADGE[role]}`}
                    >
                      <option value="superadmin">최고관리자</option>
                      <option value="admin">관리자</option>
                      <option value="business">사업부</option>
                      <option value="reporter">기자</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      {u.approved ? (
                        <span className="badge badge-success">승인됨</span>
                      ) : (
                        <span className="badge badge-warning">대기</span>
                      )}
                      {u.locked && (
                        <span className="badge badge-error">잠김</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      {u.locked && (
                        <button
                          type="button"
                          onClick={() => handleUnlock(u.user_id)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded border border-primary-500/40 bg-primary-500/5 px-2 py-1 text-xs font-medium text-primary-500 hover:bg-primary-500/10 disabled:opacity-50"
                        >
                          <LockOpen className="h-3 w-3" />
                          잠금 해제
                        </button>
                      )}
                      {!u.approved ? (
                        <button
                          type="button"
                          onClick={() => handleApprove(u.user_id, true)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded border border-success/40 bg-success/5 px-2 py-1 text-xs font-medium text-success hover:bg-success/10 disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" />
                          승인
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleApprove(u.user_id, false)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded border border-border bg-white px-2 py-1 text-xs hover:bg-background disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                          승인 취소
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(u.user_id, u.name)}
                        disabled={busy}
                        aria-label="삭제"
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-white text-error hover:bg-error/5 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
