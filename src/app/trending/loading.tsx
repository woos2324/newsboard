import { PageShell } from "@/components/PageShell";

function Sk({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ""}`} />;
}

export default function TrendingLoading() {
  return (
    <PageShell title="" description="">
      <div className="flex h-full flex-col gap-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Sk className="h-6 w-36" />
            <Sk className="h-3 w-48" />
          </div>
          <div className="flex gap-2">
            <Sk className="h-8 w-20 rounded-lg" />
            <Sk className="h-8 w-28 rounded-lg" />
          </div>
        </div>

        {/* 스탯 카드 3개 */}
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card py-3 text-center">
              <Sk className="mx-auto mb-1.5 h-8 w-10" />
              <Sk className="mx-auto h-3 w-12" />
            </div>
          ))}
        </div>

        {/* 테이블 */}
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex-1 overflow-hidden rounded-xl border border-border bg-white">
            {/* 테이블 헤더 */}
            <div className="flex items-center gap-4 border-b border-border bg-background px-4 py-3">
              <Sk className="h-3 w-6" />
              <Sk className="h-3 w-8" />
              <Sk className="h-3 w-20" />
              <Sk className="ml-auto h-3 w-14" />
              <Sk className="h-3 w-14" />
              <Sk className="h-3 w-14" />
              <Sk className="h-3 w-14" />
            </div>
            {/* 테이블 행 12개 */}
            {[...Array(12)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-0">
                <Sk className="h-7 w-1 rounded-full" />
                <Sk className="h-4 w-6" />
                <Sk className="h-4 w-32" />
                <Sk className="ml-auto h-3 w-12" />
                <Sk className="h-3 w-16" />
                <Sk className="h-3 w-20" />
                <Sk className="h-5 w-14 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
