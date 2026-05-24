import Link from "next/link";

export default function SignupPendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md card text-center">
        <h1 className="text-2xl font-bold mb-2">승인 대기 중</h1>
        <p className="mt-4 text-sm text-foreground">
          가입이 완료되었습니다. 사업부 계정은 관리자 승인 후 접근 가능합니다.
        </p>
        <p className="mt-2 text-sm text-muted">
          승인은 보통 영업일 기준 1일 이내 처리됩니다.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded border border-border px-4 py-2 text-sm font-medium"
        >
          로그인 화면으로
        </Link>
      </div>
    </div>
  );
}
