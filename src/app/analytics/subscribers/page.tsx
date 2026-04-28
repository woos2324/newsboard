import Link from "next/link";
import { Pin } from "lucide-react";
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

function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${month}/${day}`;
}

function formatSignedCount(value: number | null): string {
  if (value == null) return "-";
  if (value > 0) return `+${value.toLocaleString()}`;
  if (value < 0) return value.toLocaleString();
  return "0";
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
  const recentDates = competitors[0]?.snapshots.map((snapshot) => snapshot.snapshotDate) ?? [];

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
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="max-h-[560px] overflow-auto">
                <table className="min-w-[980px] w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-center text-[11px] font-semibold text-muted">
                        순위
                      </th>
                      <th className="sticky top-0 z-20 border-l border-border bg-slate-50 px-3 py-2 text-center text-[11px] font-semibold text-muted">
                        1주 전
                      </th>
                      <th className="sticky top-0 z-20 border-l border-border bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold text-muted">
                        언론사
                      </th>
                      <th className="sticky top-0 z-20 border-l border-border bg-slate-50 px-3 py-2 text-right text-[11px] font-semibold text-muted">
                        점유율
                      </th>
                      {recentDates.flatMap((snapshotDate) => [
                        <th
                          key={`pair-${snapshotDate}-count`}
                          className="sticky top-0 z-20 border-l border-border bg-slate-50 px-3 py-2 text-right text-[11px] font-semibold text-foreground"
                        >
                          {formatDateLabel(snapshotDate)}
                        </th>,
                        <th
                          key={`pair-${snapshotDate}-delta`}
                          className="sticky top-0 z-20 border-l border-border bg-slate-50 px-3 py-2 text-right text-[11px] font-semibold text-muted"
                        >
                          증감수
                        </th>,
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => {
                      const cellBase = row.isPinned
                        ? "border-b border-border bg-primary-500/[0.06]"
                        : "border-b border-border bg-white";
                      const pinnedSticky = row.isPinned ? " sticky top-11 z-10" : "";
                      const weekRankText =
                        row.weekAgoRank == null ? "-" : `${row.weekAgoRank}`;
                      const rankDeltaText =
                        row.rankDelta == null
                          ? "-"
                          : row.rankDelta > 0
                            ? `+${row.rankDelta}`
                            : `${row.rankDelta}`;

                      return (
                        <tr key={row.media}>
                          <td
                            className={`${cellBase}${pinnedSticky} px-3 py-3 text-center text-xs font-semibold ${
                              row.isPinned ? "shadow-[inset_3px_0_0_0_#1E40AF]" : ""
                            }`}
                          >
                            {row.currentRank}
                          </td>
                          <td
                            className={`${cellBase}${pinnedSticky} border-l border-border px-3 py-3 text-center text-xs`}
                          >
                            <div className="leading-tight">
                              <p className="font-medium text-foreground">{weekRankText}</p>
                              <p className="caption mt-1">{rankDeltaText}</p>
                            </div>
                          </td>
                          <td
                            className={`${cellBase}${pinnedSticky} border-l border-border px-3 py-3`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">
                                {row.media}
                              </span>
                              {row.isPinned && (
                                <span className="badge badge-success">
                                  <Pin className="h-3 w-3" />
                                  고정
                                </span>
                              )}
                            </div>
                          </td>
                          <td
                            className={`${cellBase}${pinnedSticky} border-l border-border px-3 py-3 text-right font-medium text-foreground`}
                          >
                            {row.share.toFixed(3)}%
                          </td>
                          {row.snapshots.flatMap((snapshot) => [
                            <td
                              key={`${row.media}-${snapshot.snapshotDate}-count`}
                              className={`${cellBase}${pinnedSticky} border-l border-border px-3 py-3 text-right font-medium text-foreground`}
                            >
                              {snapshot.subscriberCount == null
                                ? "-"
                                : snapshot.subscriberCount.toLocaleString()}
                            </td>,
                            <td
                              key={`${row.media}-${snapshot.snapshotDate}-delta`}
                              className={`${cellBase}${pinnedSticky} border-l border-border px-3 py-3 text-right font-medium ${
                                snapshot.dailyDelta == null
                                  ? "text-muted"
                                  : snapshot.dailyDelta > 0
                                    ? "text-success"
                                    : snapshot.dailyDelta < 0
                                      ? "text-primary-500"
                                      : "text-foreground"
                              }`}
                            >
                              {formatSignedCount(snapshot.dailyDelta)}
                            </td>,
                          ])}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
