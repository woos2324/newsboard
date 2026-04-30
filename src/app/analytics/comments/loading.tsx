import { PageShell } from "@/components/PageShell";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ""}`} />;
}

function CommentCardSkeleton() {
  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-5 w-14" />
      </div>
      <Skeleton className="mb-1 h-4 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export default function CommentsLoading() {
  return (
    <PageShell title="독자 반응" description="댓글 수 기준 인기 기사">
      <div className="mb-6">
        <Skeleton className="mb-4 h-5 w-32" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => <CommentCardSkeleton key={i} />)}
        </div>
      </div>
      <div>
        <Skeleton className="mb-4 h-5 w-32" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => <CommentCardSkeleton key={i} />)}
        </div>
      </div>
    </PageShell>
  );
}
