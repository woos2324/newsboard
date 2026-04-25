import { PageShell } from "@/components/PageShell";
import { SubscriberChart } from "@/components/dashboard/SubscriberChart";
import {
  getOurSubscriberSeries,
  getCompetitorSubscribers,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

function weekdayKr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+09:00");
  return WEEKDAY_KR[d.getUTCDay()];
}

export default async function SubscribersPage() {
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
          <div className="mb-3">
            <h2 className="section-title">경쟁사 구독자 규모</h2>
            <p className="caption">7일 누적 변화</p>
          </div>
          {competitors.length === 0 ? (
            <p className="caption">경쟁사 구독자 스냅샷 데이터가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-border">
              {competitors.map((r) => (
                <li
                  key={r.media}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <span className="font-medium">{r.media}</span>
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
