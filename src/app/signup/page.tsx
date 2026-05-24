"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestSignupOtp, verifySignupOtp, completeSignup } from "./actions";
import type { SignupRole } from "@/lib/roles";

type Step = 1 | 2 | 3;

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<SignupRole>("reporter");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleStep1(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await requestSignupOtp(fd);
      if (!result.ok) setError(result.error);
      else setStep(2);
    });
  }

  function handleStep2(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("email", email);
    startTransition(async () => {
      const result = await verifySignupOtp(fd);
      if (!result.ok) setError(result.error);
      else setStep(3);
    });
  }

  function handleStep3(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await completeSignup(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (role === "reporter") router.push("/");
      else router.push("/signup/pending");
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md card">
        <h1 className="text-2xl font-bold mb-2">Newsboard 가입</h1>
        <p className="text-sm text-muted mb-6">단계 {step} / 3</p>

        {error && (
          <div className="mb-4 rounded border border-error/40 bg-error/5 px-3 py-2 text-sm text-error">
            {error}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleStep1} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium">사번 이메일</span>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@segye.com"
                required
                autoFocus
                className="mt-1 w-full rounded border border-border px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-muted">
                @segye.com 이메일만 가입 가능합니다.
              </span>
            </label>
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {pending ? "전송 중..." : "인증 메일 발송"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleStep2} className="space-y-4">
            <p className="text-sm text-foreground">
              <strong>{email}</strong> 으로 6자리 인증 코드를 발송했습니다.
            </p>
            <label className="block">
              <span className="text-sm font-medium">인증 코드</span>
              <input
                type="text"
                name="token"
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                inputMode="numeric"
                maxLength={6}
                required
                autoFocus
                className="mt-1 w-full rounded border border-border px-3 py-2 text-center text-sm tracking-widest"
              />
              <span className="mt-1 block text-xs text-muted">
                코드는 10분간 유효합니다.
              </span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setToken("");
                  setError(null);
                }}
                className="flex-1 rounded border border-border px-4 py-2 text-sm"
              >
                이전
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {pending ? "확인 중..." : "확인"}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleStep3} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium">이름</span>
              <input
                type="text"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                className="mt-1 w-full rounded border border-border px-3 py-2 text-sm"
              />
            </label>
            <fieldset>
              <legend className="text-sm font-medium">역할</legend>
              <div className="mt-2 space-y-2">
                <label className="flex cursor-pointer items-start gap-2 rounded border border-border p-3">
                  <input
                    type="radio"
                    name="role"
                    value="reporter"
                    checked={role === "reporter"}
                    onChange={() => setRole("reporter")}
                    className="mt-1"
                  />
                  <div className="text-sm">
                    <div className="font-medium">기자</div>
                    <div className="text-xs text-muted">
                      이슈 분석 · 미보도 탐지 · 기사 현황 등 (트래픽 · 구독자 제외)
                    </div>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded border border-border p-3">
                  <input
                    type="radio"
                    name="role"
                    value="business"
                    checked={role === "business"}
                    onChange={() => setRole("business")}
                    className="mt-1"
                  />
                  <div className="text-sm">
                    <div className="font-medium">사업부</div>
                    <div className="text-xs text-muted">
                      트래픽 · 구독자 분석만 (가입 후 관리자 승인 필요)
                    </div>
                  </div>
                </label>
              </div>
            </fieldset>
            <label className="block">
              <span className="text-sm font-medium">비밀번호</span>
              <input
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="mt-1 w-full rounded border border-border px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-muted">
                8자 이상, 대소문자 + 숫자 + 특수문자 포함
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium">비밀번호 확인</span>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                minLength={8}
                className="mt-1 w-full rounded border border-border px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {pending ? "가입 처리 중..." : "가입 완료"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="font-medium text-primary-500">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
