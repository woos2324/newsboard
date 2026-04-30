import { PageShell } from "@/components/PageShell";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ""}`} />;
}

export default function GapLoading() {
  return (
    <PageShell title="미보도 탐지" description="경쟁사가 보도했지만 자사가 놓친 이슈를 우선순위별로 표시합니다.">
      <div className="grid grid-cols-1 gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="card">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="mb-2 flex gap-2">
                  <Skeleton className="h-5 w-10" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="mb-1 h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
