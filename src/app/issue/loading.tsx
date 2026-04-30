import { PageShell } from "@/components/PageShell";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ""}`} />;
}

export default function IssueLoading() {
  return (
    <PageShell title="이슈 분석" description="관련 기사 2건 이상인 오늘의 핵심 이슈 목록">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="card">
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="mb-1 h-3 w-5/6" />
            <Skeleton className="mb-4 h-3 w-4/6" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-5 w-12" />
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
