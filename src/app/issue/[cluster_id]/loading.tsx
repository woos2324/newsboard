import { PageShell } from "@/components/PageShell";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ""}`} />;
}

export default function IssueDetailLoading() {
  return (
    <PageShell title="이슈 상세">
      <div className="card mb-4">
        <Skeleton className="mb-3 h-5 w-2/3" />
        <Skeleton className="mb-2 h-3 w-full" />
        <Skeleton className="mb-2 h-3 w-5/6" />
        <div className="mt-4 flex gap-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-5 w-14" />)}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="mt-2 h-4 w-full" />
          </div>
        ))}
      </div>
    </PageShell>
  );
}
