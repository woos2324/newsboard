export default function Loading() {
  return (
    <div className="mx-auto max-w-screen-2xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-7 w-72 animate-pulse rounded-lg bg-gray-200" />
        <div className="flex gap-2">
          <div className="h-8 w-24 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-8 w-20 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-8 w-20 animate-pulse rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-80 animate-pulse rounded-2xl border border-gray-200 bg-white" />
        ))}
      </div>
    </div>
  )
}
