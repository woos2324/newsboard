function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ''}`} />
}

export default function TrendLoading() {
  return (
    <div>
      {/* 주간/월간 토글 */}
      <Skeleton className="h-9 w-40 rounded-lg mb-5" />

      {/* 통계 카드 3개 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
            <Skeleton className="h-3 w-24 mb-2" />
            <Skeleton className="h-7 w-16 mb-1" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* 성향 트렌드 차트 */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <Skeleton className="h-4 w-40 mb-6" />
          <div className="flex items-end gap-3 h-36">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col gap-0.5 justify-end h-28">
                  <div className={`w-full rounded-t-sm animate-pulse bg-gray-200 ${['h-10','h-12','h-16','h-20','h-24'][i]}`} />
                </div>
                <Skeleton className="h-3 w-6" />
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-3 w-16" />)}
          </div>
        </div>

        {/* 주제 분포 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <Skeleton className="h-4 w-28 mb-4" />
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i}>
                <div className="flex justify-between mb-1">
                  <Skeleton className="h-3 w-8" />
                  <Skeleton className="h-3 w-14" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 사설 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="divide-y divide-gray-100">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <Skeleton className="h-3 w-20 flex-shrink-0" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-5 w-16 rounded-full flex-shrink-0" />
              <Skeleton className="h-5 w-12 rounded-full flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
