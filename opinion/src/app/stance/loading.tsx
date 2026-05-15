function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ''}`} />
}

export default function StanceLoading() {
  return (
    <div>
      {/* 주제 필터 */}
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="h-3 w-16" />
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-7 w-14 rounded-full" />)}
      </div>

      {/* 성향 스펙트럼 차트 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <Skeleton className="h-4 w-48 mb-6" />
        <div className="flex justify-between mb-2">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-2 w-full rounded-full mb-4" />
        <div className="relative h-6 mb-6">
          {[10, 23, 36, 49, 62, 75, 88].map((left) => (
            <div key={left} className="absolute h-3 w-8 animate-pulse rounded bg-gray-200" style={{ left: `${left}%` }} />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>

      {/* 주제별 성향 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="p-4 space-y-3">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-20" />
              {[...Array(5)].map((_, j) => <Skeleton key={j} className="h-6 w-16 rounded-full" />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
