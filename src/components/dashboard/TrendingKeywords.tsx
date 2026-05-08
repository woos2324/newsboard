import { TrendingUp } from "lucide-react";
import Link from "next/link";
import type { TrendingKeyword } from "@/lib/queries";

type Props = {
  items: TrendingKeyword[];
  fetchedAt: string;
};

const TRAFFIC_STYLE: Record<string, string> = {
  "1M+": "badge-error",
  "100K+": "badge-error",
  "10K+": "badge-warning",
  "1K+": "badge-muted",
  "100+": "badge-muted",
};

function trafficStyle(traffic: string): string {
  return TRAFFIC_STYLE[traffic] ?? "badge-muted";
}

function formatFetchedAt(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m} 기준`;
}

export function TrendingKeywords({ items, fetchedAt }: Props) {
  if (items.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-warning" />
          <h2 className="section-title">구글 급상승 검색어</h2>
        </div>
        <p className="caption py-4 text-center">데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-warning" />
          <div>
            <h2 className="section-title">구글 급상승 검색어</h2>
            <p className="caption mt-0.5">{formatFetchedAt(fetchedAt)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-0 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((item) => (
          <div
            key={item.trending_id}
            className="flex items-center gap-2 py-2 border-b border-border last:border-0"
          >
            <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted">
              {item.traffic_rank}
            </span>
            <div className="min-w-0 flex-1">
              {item.matched_cluster_id ? (
                <Link
                  href={`/issue/${item.matched_cluster_id}`}
                  className="block truncate text-sm font-medium text-primary-500 hover:underline"
                >
                  {item.keyword}
                </Link>
              ) : (
                <span className="block truncate text-sm font-medium">
                  {item.keyword}
                </span>
              )}
            </div>
            <span className={`badge shrink-0 ${trafficStyle(item.approx_traffic)}`}>
              {item.approx_traffic}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
