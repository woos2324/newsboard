import { PageShell } from "@/components/PageShell";

function Sk({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ""}`} />;
}

export default function TrafficLoading() {
  return (
    <PageShell>
      <div className="flex flex-col gap-6">
        {/* 헤더 + 날짜·디바이스 선택 */}
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <Sk className="h-6 w-28" />
            <Sk className="h-3 w-72" />
          </div>
          <div className="flex gap-2">
            <Sk className="h-8 w-32 rounded-lg" />
            <Sk className="h-8 w-32 rounded-lg" />
          </div>
        </div>

        {/* KPI 카드 4개 */}
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card flex flex-col gap-2 p-4">
              <Sk className="h-3 w-20" />
              <Sk className="h-8 w-28" />
              <Sk className="h-2 w-full rounded-full" />
              <Sk className="h-3 w-24" />
            </div>
          ))}
        </div>

        {/* Row 1: 인기 기사 + 시간대 차트 */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "7fr 5fr" }}>
          {/* 인기 기사 테이블 */}
          <div className="card overflow-hidden p-0">
            <div className="border-b border-border px-4 py-3">
              <Sk className="h-4 w-32" />
            </div>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                <Sk className="h-4 w-6 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Sk className="h-3 w-full" />
                  <Sk className="h-3 w-1/2" />
                </div>
                <Sk className="h-4 w-16 shrink-0" />
              </div>
            ))}
          </div>

          {/* 시간대 차트 */}
          <div className="card p-4">
            <Sk className="mb-4 h-4 w-36" />
            <Sk className="h-48 w-full rounded-lg" />
            <div className="mt-3 space-y-1.5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Sk className="h-3 w-16" />
                  <Sk className="h-3 w-20" />
                  <Sk className="ml-auto h-3 w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: 유입 경로 도넛 + 검색 키워드 */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "5fr 7fr" }}>
          {/* 도넛 차트 */}
          <div className="card flex flex-col items-center gap-4 p-4">
            <Sk className="mb-2 h-4 w-24 self-start" />
            <Sk className="h-40 w-40 rounded-full" />
            <div className="w-full space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Sk className="h-3 w-3 rounded-full" />
                  <Sk className="h-3 flex-1" />
                  <Sk className="h-3 w-12" />
                </div>
              ))}
            </div>
          </div>

          {/* 키워드 테이블 */}
          <div className="card overflow-hidden p-0">
            <div className="border-b border-border px-4 py-3">
              <Sk className="h-4 w-36" />
            </div>
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                <Sk className="h-4 w-6 shrink-0" />
                <Sk className="h-3 flex-1" />
                <Sk className="h-3 w-16 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
