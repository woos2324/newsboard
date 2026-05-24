"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { loginWithPassword } from "./actions";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await loginWithPassword(fd);
      // 성공 시 redirect — 여기 도달하면 실패
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md card">
        <h1 className="mb-6 text-2xl font-bold">Newsboard 로그인</h1>

        {error && (
          <div className="mb-4 rounded border border-error/40 bg-error/5 px-3 py-2 text-sm text-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">이메일</span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@segye.com"
              required
              autoFocus
              autoComplete="email"
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">비밀번호</span>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {pending ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          아직 계정이 없으신가요?{" "}
          <Link href="/signup" className="font-medium text-primary-500">
            가입하기
          </Link>
        </p>
      </div>
    </div>
  );
}
