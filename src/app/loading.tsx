import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ""}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-6 py-6">
          {/* StatCards */}
          <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card">
                <Skeleton className="mb-3 h-3 w-1/2" />
                <Skeleton className="mb-2 h-7 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
          {/* AI 브리핑 + 이슈 카드 */}
          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="card lg:col-span-1">
              <Skeleton className="mb-3 h-4 w-1/3" />
              <Skeleton className="mb-2 h-3 w-full" />
              <Skeleton className="mb-2 h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="card">
                  <Skeleton className="mb-2 h-3 w-1/4" />
                  <Skeleton className="mb-1 h-4 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          </div>
          {/* 랭킹 + 미보도 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="card">
              <Skeleton className="mb-4 h-4 w-1/4" />
              {[...Array(5)].map((_, i) => (
                <div key={i} className="mb-3 flex gap-3">
                  <Skeleton className="h-3 w-4" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
            <div className="card">
              <Skeleton className="mb-4 h-4 w-1/4" />
              {[...Array(4)].map((_, i) => (
                <div key={i} className="mb-3">
                  <Skeleton className="mb-1 h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
