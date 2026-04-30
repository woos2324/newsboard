import { PageShell } from "@/components/PageShell";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ""}`} />;
}

export default function CompareLoading() {
  return (
    <PageShell title="경쟁사 비교" description="인기 랭킹 및 섹션별 랭킹 기반 경쟁사 비교">
      {/* 언론사 칩 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-7 w-16 rounded-full" />)}
      </div>
      {/* 탭 */}
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
      </div>
      {/* 랭킹 컬럼들 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card">
            <Skeleton className="mb-4 h-4 w-1/3" />
            {[...Array(5)].map((_, j) => (
              <div key={j} className="mb-3 flex gap-3">
                <Skeleton className="h-3 w-4" />
                <Skeleton className="h-3 flex-1" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </PageShell>
  );
}
