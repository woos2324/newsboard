function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ''}`} />
}

export default function LabelLoading() {
  return (
    <div>
      {/* 상단 카운트 */}
      <div className="flex items-center justify-between mb-5">
        <Skeleton className="h-4 w-40" />
      </div>

      {/* 카드 그리드 16개 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[...Array(16)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-4 w-full mb-1" />
            <Skeleton className="h-4 w-4/5 mb-3" />
            <Skeleton className="h-3 w-full mb-1" />
            <Skeleton className="h-3 w-5/6 mb-1" />
            <Skeleton className="h-3 w-3/4 mb-3" />
            <div className="flex items-center gap-2 mt-auto">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-10 rounded-full" />
              <Skeleton className="h-7 w-12 rounded-lg ml-auto" />
            </div>
          </div>
        ))}
      </div>

      {/* 페이지네이션 */}
      <div className="flex items-center justify-center gap-1">
        <Skeleton className="h-8 w-12 rounded-lg" />
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-9 rounded-lg" />)}
        <Skeleton className="h-8 w-12 rounded-lg" />
      </div>
    </div>
  )
}
