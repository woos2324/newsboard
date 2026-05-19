function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ''}`} />
}

function GroupSkeleton({ rows }: { rows: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3 pb-2 border-b border-gray-200">
        <div className="w-1 h-5 bg-gray-200 rounded" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-3 w-20 flex-shrink-0" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-5 w-14 rounded-full flex-shrink-0" />
            <Skeleton className="h-3 w-10 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TodayLoading() {
  return (
    <div>
      {/* 상단 필터 바 */}
      <div className="flex items-center justify-between mb-5">
        <Skeleton className="h-4 w-40" />
        <div className="flex gap-1">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-16 rounded-lg" />)}
        </div>
      </div>

      <GroupSkeleton rows={5} />
      <GroupSkeleton rows={4} />
      <GroupSkeleton rows={3} />
    </div>
  )
}
