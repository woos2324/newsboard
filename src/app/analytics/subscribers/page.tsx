import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { SubscriberChart } from "@/components/dashboard/SubscriberChart";
import {
  getOurSubscriberSeries,
  getCompetitorSubscribers,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const TOP_N = 15;
const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

function weekdayKr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+09:00");
  return WEEKDAY_KR[d.getUTCDay()];
}

type Props = {
  searchParams: Promise<{ show?: string }>;
};

export default async function SubscribersPage({ searchParams }: Props) {
  const { show } = await searchParams;
  const showAll = show === "all";

  const [sub, competitors] = await Promise.all([
    getOurSubscriberSeries(7),
    getCompetitorSubscribers(),
  ]);

  const series =
    sub.series.length > 0
      ? sub.series.map((p) => ({
          day: weekdayKr(p.snapshot_date),
          value: p.subscriber_count,
        }))
      : [{ day: "-", value: 0 }];

  const visible = showAll ? competitors : competitors.slice(0, TOP_N);
  const remaining = competitors.length - visible.length;

  return (
    <PageShell
      title="구독자 분석"
      description="자사 및 경쟁사 언론사의 7일 구독자 변화 추세를 확인합니다."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SubscriberChart
          data={series}
          total={sub.total.toLocaleString()}
          delta={sub.deltaPct}
        />
        <div className="card lg:col-span-2">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="section-title">경쟁사 구독자 규모</h2>
              <p className="caption">
                7일 누적 변화
                {competitors.length > 0 &&
                  ` · 전체 ${competitors.length}개 매체${
                    showAll ? "" : ` 중 상위 ${visible.length}개`
                  }`}
              </p>
            </div>
            {competitors.length > TOP_N && (
              <Link
                href={
                  showAll
                    ? "/analytics/subscribers"
                    : "/analytics/subscribers?show=all"
                }
                className="text-xs font-medium text-primary-500 hover:underline"
              >
                {showAll ? "상위만 보기" : `+${remaining}개 더 →`}
              </Link>
            )}
          </div>
          {competitors.length === 0 ? (
            <p className="caption">경쟁사 구독자 스냅샷 데이터가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((r, idx) => (
                <li
                  key={r.media}
                  className="flex items-center gap-3 py-3 text-sm"
                >
                  <span className="w-6 text-right text-xs font-semibold text-muted">
                    {idx + 1}
                  </span>
                  <span className="flex-1 truncate font-medium">{r.media}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-muted">
                      {r.value.toLocaleString()}
                    </span>
                    <span
                      className={`badge ${
                        r.delta >= 0 ? "badge-success" : "badge-error"
                      }`}
                    >
                      {r.delta >= 0 ? "+" : ""}
                      {r.delta}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageShell>
  );
}
