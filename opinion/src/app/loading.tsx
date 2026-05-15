function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ''}`} />
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

      {/* 토픽 그룹 2개 */}
      {[...Array(2)].map((_, g) => (
        <div key={g} className="mb-8">
          <div className="flex items-center gap-3 mb-3 pb-2 border-b border-gray-200">
            <div className="w-1 h-5 bg-gray-200 rounded" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(g === 0 ? 4 : 3)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-4/5 mb-3" />
                <Skeleton className="h-3 w-full mb-1" />
                <Skeleton className="h-3 w-5/6 mb-1" />
                <Skeleton className="h-3 w-3/4 mb-3" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 기타 단독 그룹 */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3 pb-2 border-b border-gray-200">
          <div className="w-1 h-5 bg-gray-200 rounded" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-10" />
              </div>
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-3/4 mb-3" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
