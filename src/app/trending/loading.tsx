import { PageShell } from "@/components/PageShell";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ""}`} />;
}

export default function TrendingLoading() {
  return (
    <PageShell title="실시간 트렌드" description="구글 급상승 검색어 기준 세계일보 보도 현황">
      <div className="mb-6 grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card py-4 text-center">
            <Skeleton className="mx-auto mb-2 h-7 w-12" />
            <Skeleton className="mx-auto h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="card flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-12" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <div className="mt-2 space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
