"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { requestResetOtp, verifyResetOtp, updatePassword } from "./actions";
import {
  getMissingPasswordRequirements,
  getPasswordRequirementMessage,
} from "@/lib/password";

type Step = 1 | 2 | 3;

export default function ResetPasswordPage() {
  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [passwordConfirmError, setPasswordConfirmError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const missingPasswordRequirements = getMissingPasswordRequirements(password);
  const passwordRequirementMessage = getPasswordRequirementMessage(password);
  const hasPasswordRequirementError = password.length > 0 && missingPasswordRequirements.length > 0;
  const passwordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;
  const passwordConfirmMessage =
    passwordConfirmError || (passwordMismatch ? "입력한 내용과 맞지 않습니다." : null);

  function handleStep1(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await requestResetOtp(fd);
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
      const result = await verifyResetOtp(fd);
      if (!result.ok) setError(result.error);
      else setStep(3);
    });
  }

  function handleStep3(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPasswordConfirmError(null);
    if (password !== passwordConfirm) {
      setPasswordConfirmError("입력한 내용과 맞지 않습니다.");
      return;
    }
    if (missingPasswordRequirements.length > 0) {
      setError(`비밀번호 조건을 확인해주세요. 누락: ${missingPasswordRequirements.join(", ")}`);
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updatePassword(fd);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md card">
        <h1 className="text-2xl font-bold mb-2">비밀번호 찾기</h1>
        <p className="text-sm text-muted mb-4">단계 {step} / 3</p>

        {error && (
          <div className="mb-4 rounded border border-error/40 bg-error/5 px-3 py-2 text-sm text-error">
            {error}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleStep1} className="space-y-4">
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
                className="mt-1 w-full rounded border border-border px-3 py-2 text-sm"
              />
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
              <span className="mt-1 block text-xs text-muted">코드는 10분간 유효합니다.</span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setStep(1); setToken(""); setError(null); }}
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
              <span className="text-sm font-medium">새 비밀번호</span>
              <input
                type="password"
                name="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordConfirmError(null); }}
                required
                autoFocus
                className="mt-1 w-full rounded border border-border px-3 py-2 text-sm"
              />
              <span
                className={`mt-1 block text-xs ${
                  hasPasswordRequirementError ? "text-error" : password ? "text-success" : "text-muted"
                }`}
              >
                {passwordRequirementMessage}
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium">새 비밀번호 확인</span>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => { setPasswordConfirm(e.target.value); setPasswordConfirmError(null); }}
                required
                aria-invalid={!!passwordConfirmMessage}
                className={`mt-1 w-full rounded border px-3 py-2 text-sm ${
                  passwordConfirmMessage ? "border-error" : "border-border"
                }`}
              />
              {passwordConfirmMessage && (
                <span className="mt-1 block text-xs text-error">{passwordConfirmMessage}</span>
              )}
            </label>
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {pending ? "변경 중..." : "비밀번호 변경"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/login" className="font-medium text-primary-500">
            로그인으로 돌아가기
          </Link>
        </p>
      </div>
    </div>
  );
}
