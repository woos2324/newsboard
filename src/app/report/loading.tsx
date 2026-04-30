import { PageShell } from "@/components/PageShell";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ""}`} />;
}

export default function ReportLoading() {
  return (
    <PageShell title="AI 리포트" description="AI가 생성한 일간 브리핑 및 이슈 요약">
      <div className="card mb-4">
        <Skeleton className="mb-2 h-3 w-24" />
        <Skeleton className="mb-4 h-6 w-3/4" />
        <Skeleton className="mb-2 h-3 w-full" />
        <Skeleton className="mb-2 h-3 w-5/6" />
        <Skeleton className="mb-6 h-3 w-4/6" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
