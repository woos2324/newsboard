import { PageShell } from "@/components/PageShell";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ""}`} />;
}

export default function SubscribersLoading() {
  return (
    <PageShell title="구독자 분석" description="네이버 뉴스 매체별 구독자 수 추이">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 차트 */}
        <div className="card">
          <Skeleton className="mb-2 h-4 w-1/3" />
          <Skeleton className="mb-3 h-3 w-1/2" />
          <div className="mb-3 flex gap-2">
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
        {/* 표 */}
        <div className="card lg:col-span-2">
          <Skeleton className="mb-2 h-4 w-1/4" />
          <Skeleton className="mb-4 h-3 w-1/3" />
          <div className="space-y-2">
            <div className="flex gap-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-4 flex-1" />)}
            </div>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex gap-3">
                {[...Array(5)].map((_, j) => <Skeleton key={j} className="h-4 flex-1" />)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
