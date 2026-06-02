import { PageShell } from "@/components/PageShell";

function Sk({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ""}`} />;
}

export default function AdminUsersLoading() {
  return (
    <PageShell title="회원 관리" description="가입 신청 승인 및 역할 관리">
      <div className="flex flex-col gap-4">
        {/* 대기 알림 영역 자리 */}
        <Sk className="h-10 w-full rounded-lg" />

        {/* 테이블 */}
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          {/* 헤더 행 */}
          <div className="grid grid-cols-6 gap-4 border-b border-border bg-background px-5 py-3">
            {["w-16", "w-36", "w-24", "w-16", "w-24", "w-20"].map((w, i) => (
              <Sk key={i} className={`h-3 ${w}`} />
            ))}
          </div>
          {/* 데이터 행 8개 */}
          {[...Array(8)].map((_, i) => (
            <div key={i} className="grid grid-cols-6 items-center gap-4 border-b border-border px-5 py-4 last:border-0">
              <Sk className="h-4 w-20" />
              <Sk className="h-3 w-40" />
              <Sk className="h-6 w-24 rounded-full" />
              <Sk className="h-5 w-14 rounded-full" />
              <Sk className="h-3 w-24" />
              <div className="flex gap-2">
                <Sk className="h-7 w-14 rounded-md" />
                <Sk className="h-7 w-14 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
