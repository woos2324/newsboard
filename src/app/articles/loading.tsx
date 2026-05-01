import { PageShell } from "@/components/PageShell";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ""}`} />;
}

export default function ArticlesLoading() {
  return (
    <PageShell title="자사 기사 현황" description="세계일보가 네이버에 발행한 기사 목록과 섹션별 현황">
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card">
            <Skeleton className="mb-2 h-3 w-1/2" />
            <Skeleton className="mb-1 h-7 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <Skeleton className="mb-2 h-4 w-1/4" />
          <Skeleton className="mb-4 h-3 w-1/3" />
          <Skeleton className="h-28 w-full" />
        </div>
        <div className="card">
          <Skeleton className="mb-2 h-4 w-1/4" />
          <Skeleton className="mb-4 h-3 w-1/3" />
          <div className="flex flex-col gap-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-3 w-full" />)}
          </div>
        </div>
      </div>
      <div className="card">
        <Skeleton className="mb-4 h-4 w-1/4" />
        <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="flex gap-3 px-4 py-3">
              <Skeleton className="h-3 w-4" />
              <div className="flex-1">
                <Skeleton className="mb-1.5 h-4 w-full" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
