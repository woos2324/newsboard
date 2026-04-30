"use client";

import { Pin } from "lucide-react";
import { useMemo, useState } from "react";
import type { CompetitorSubscriberView } from "@/lib/queries";

const TOP_N = 15;
const CHART_COLORS = [
  "#38BDF8",
  "#F97316",
  "#EC4899",
  "#14B8A6",
  "#8B5CF6",
  "#84CC16",
];

type Props = {
  competitors: CompetitorSubscriberView[];
  ownTotal: string;
  ownDeltaPct: number;
};

type ChartMetric = "count" | "delta";

type ChartPoint = {
  x: number;
  y: number;
  value: number | null;
  label: string;
};

function formatTableDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${month}/${day}`;
}

function formatChartDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${Number(year)}.${Number(month)}.${Number(day)}.`;
}

function formatSignedCount(value: number | null): string {
  if (value == null) return "-";
  if (value > 0) return `+${value.toLocaleString()}`;
  if (value < 0) return value.toLocaleString();
  return "0";
}

function formatRankDelta(value: number | null): string {
  if (value == null) return "-";
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function buildInitialSelectedMedia(rows: CompetitorSubscriberView[]): string[] {
  const selected: string[] = [];

  for (const row of rows) {
    if (row.isPinned) selected.push(row.media);
  }

  for (const row of rows) {
    if (selected.length >= 3) break;
    if (!selected.includes(row.media)) selected.push(row.media);
  }

  return selected;
}

function buildTicks(min: number, max: number, count = 6): number[] {
  if (count <= 1) return [min];
  if (min === max) return Array.from({ length: count }, () => min);

  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, idx) =>
    Math.round((max - step * idx) * 10) / 10
  );
}

function buildLinePath(points: ChartPoint[]): string {
  let path = "";
  let drawing = false;

  for (const point of points) {
    if (point.value == null) {
      drawing = false;
      continue;
    }

    const segment = `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    path += `${drawing ? " L" : "M"}${segment}`;
    drawing = true;
  }

  return path.trim();
}

export function SubscriberComparisonExplorer({
  competitors,
  ownTotal,
  ownDeltaPct,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("count");
  const [selectedMedia, setSelectedMedia] = useState(() =>
    buildInitialSelectedMedia(competitors)
  );

  const visibleRows = showAll ? competitors : competitors.slice(0, TOP_N);
  const tableDates =
    competitors[0]?.tableSnapshots.map((snapshot) => snapshot.snapshotDate) ?? [];

  const selectedRows = useMemo(
    () =>
      selectedMedia
        .map((media) => competitors.find((row) => row.media === media) ?? null)
        .filter((row): row is CompetitorSubscriberView => row != null),
    [competitors, selectedMedia]
  );

  const chartDates =
    selectedRows[0]?.trendSnapshots.map((snapshot) => snapshot.snapshotDate) ??
    competitors[0]?.trendSnapshots.map((snapshot) => snapshot.snapshotDate) ??
    [];

  const chartMetricLabel =
    chartMetric === "count" ? "구독자 수" : "증감수";
  const chartMetricDescription =
    chartMetric === "count"
      ? "선택한 매체의 최근 구독자 수"
      : "선택한 매체의 최근 일별 증감수";

  const chartValues = selectedRows.flatMap((row) =>
    row.trendSnapshots
      .map((snapshot) =>
        chartMetric === "count"
          ? snapshot.subscriberCount
          : snapshot.dailyDelta
      )
      .filter((value): value is number => value != null)
  );

  const yMinRaw = chartValues.length > 0 ? Math.min(...chartValues) : -100;
  const yMaxRaw = chartValues.length > 0 ? Math.max(...chartValues) : 100;
  const yPadding = Math.max(Math.round((yMaxRaw - yMinRaw) * 0.12), 30);
  const yMin = Math.floor((yMinRaw - yPadding) / 10) * 10;
  const yMax = Math.ceil((yMaxRaw + yPadding) / 10) * 10;
  const yRange = Math.max(yMax - yMin, 1);
  const yTicks = buildTicks(yMin, yMax, 6);

  const chartWidth = 700;
  const chartHeight = 360;
  const plotLeft = 56;
  const plotRight = 20;
  const plotTop = 22;
  const plotBottom = 72;
  const plotWidth = chartWidth - plotLeft - plotRight;
  const plotHeight = chartHeight - plotTop - plotBottom;
  const xStep =
    chartDates.length > 1 ? plotWidth / (chartDates.length - 1) : plotWidth;

  const zeroLineY =
    chartMetric === "delta" && yMin <= 0 && yMax >= 0
      ? plotTop + ((yMax - 0) / yRange) * plotHeight
      : null;

  const series = selectedRows.map((row, idx) => {
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    const points = row.trendSnapshots.map((snapshot, pointIndex) => {
      const value =
        chartMetric === "count"
          ? snapshot.subscriberCount
          : snapshot.dailyDelta;
      const x = plotLeft + pointIndex * xStep;
      const y =
        value == null
          ? plotTop + plotHeight / 2
          : plotTop + ((yMax - value) / yRange) * plotHeight;

      return {
        x,
        y,
        value,
        label: formatChartDateLabel(snapshot.snapshotDate),
      };
    });

    return {
      media: row.media,
      color,
      points,
      path: buildLinePath(points),
    };
  });

  const comparisonCaption =
    competitors.length === 0
      ? "경쟁사 구독자 데이터가 없습니다."
      : `총 ${competitors.length}개 매체${
          showAll ? "" : ` 중 상위 ${visibleRows.length}개 표시`
        }`;

  function toggleMedia(media: string) {
    setSelectedMedia((current) =>
      current.includes(media)
        ? current.filter((item) => item !== media)
        : [...current, media]
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="section-title">구독자 추이</h2>
            <p className="caption mt-0.5">{chartMetricDescription}</p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div
              className="inline-flex rounded-lg border border-border bg-slate-50 p-1"
              role="tablist"
              aria-label="구독자 추이 보기 방식"
            >
              {([
                { id: "count", label: "구독자 수" },
                { id: "delta", label: "증감수" },
              ] as const).map((option) => {
                const isActive = chartMetric === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setChartMetric(option.id)}
                    className={`min-w-[88px] rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      isActive
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="text-right">
              <p className="text-xl font-semibold tracking-tight">
                {selectedRows.length}개 선택
              </p>
              <p className="caption mt-0.5">
                {chartMetric === "count"
                  ? `자사 최신 구독자 ${ownTotal}`
                  : `자사 7일 변화 ${ownDeltaPct >= 0 ? "+" : ""}${ownDeltaPct}% · 총 ${ownTotal}`}
              </p>
            </div>
          </div>
        </div>

        {selectedRows.length === 0 ? (
          <div className="mt-4 flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-border bg-slate-50 px-6 text-center">
            <p className="caption">
              오른쪽 표에서 체크한 매체가 이 그래프에 표시됩니다.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {series.map((row) => (
                <div
                  key={row.media}
                  className="inline-flex items-center gap-2 text-xs font-medium text-foreground"
                >
                  <span
                    className="h-3 w-8 rounded-sm"
                    style={{ backgroundColor: row.color }}
                  />
                  <span>{row.media}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-border bg-white">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="aspect-[16/9] w-full"
                preserveAspectRatio="xMidYMid meet"
                aria-label={`선택한 매체의 ${chartMetricLabel} 추이`}
              >
                {yTicks.map((tick) => {
                  const y = plotTop + ((yMax - tick) / yRange) * plotHeight;
                  return (
                    <g key={tick}>
                      <line
                        x1={plotLeft}
                        x2={chartWidth - plotRight}
                        y1={y}
                        y2={y}
                        stroke="#E5E7EB"
                        strokeWidth="1"
                      />
                      <text
                        x={plotLeft - 10}
                        y={y + 4}
                        fill="#6B7280"
                        fontSize="10"
                        textAnchor="end"
                      >
                        {Math.round(tick).toLocaleString()}
                      </text>
                    </g>
                  );
                })}

                {zeroLineY != null && (
                  <line
                    x1={plotLeft}
                    x2={chartWidth - plotRight}
                    y1={zeroLineY}
                    y2={zeroLineY}
                    stroke="#CBD5E1"
                    strokeWidth="1.2"
                  />
                )}

                {chartDates.map((date, idx) => {
                  const x = plotLeft + idx * xStep;
                  return (
                    <g key={date}>
                      <line
                        x1={x}
                        x2={x}
                        y1={plotTop}
                        y2={plotTop + plotHeight}
                        stroke="#F1F5F9"
                        strokeWidth="1"
                      />
                      <text
                        x={x}
                        y={chartHeight - 18}
                        fill="#6B7280"
                        fontSize="10"
                        textAnchor="end"
                        transform={`rotate(-28 ${x} ${chartHeight - 18})`}
                      >
                        {formatChartDateLabel(date)}
                      </text>
                    </g>
                  );
                })}

                {series.map((row) => (
                  <g key={row.media}>
                    <path
                      d={row.path}
                      fill="none"
                      stroke={row.color}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {row.points.map((point) =>
                      point.value == null ? null : (
                        <circle
                          key={`${row.media}-${point.label}`}
                          cx={point.x}
                          cy={point.y}
                          r="3.2"
                          fill={row.color}
                        />
                      )
                    )}
                  </g>
                ))}
              </svg>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="section-title">경쟁사 구독자 규모</h2>
            <p className="caption">{comparisonCaption}</p>
          </div>
        </div>

        {competitors.length === 0 ? (
          <p className="caption">경쟁사 구독자 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-center text-[11px] font-semibold text-muted">
                      선택
                    </th>
                    <th className="sticky top-0 z-20 border-l border-border bg-slate-50 px-3 py-2 text-center text-[11px] font-semibold text-muted">
                      순위
                    </th>
                    <th className="sticky top-0 z-20 border-l border-border bg-slate-50 px-3 py-2 text-center text-[11px] font-semibold text-muted">
                      1주 전(±)
                    </th>
                    <th className="sticky top-0 z-20 border-l border-border bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold text-muted">
                      언론사
                    </th>
                    <th className="sticky top-0 z-20 border-l border-border bg-slate-50 px-3 py-2 text-right text-[11px] font-semibold text-muted">
                      점유율
                    </th>
                    {tableDates.flatMap((snapshotDate) => [
                      <th
                        key={`count-${snapshotDate}`}
                        className="sticky top-0 z-20 border-l border-border bg-slate-50 px-3 py-2 text-right text-[11px] font-semibold text-foreground"
                      >
                        {formatTableDateLabel(snapshotDate)}
                      </th>,
                      <th
                        key={`delta-${snapshotDate}`}
                        className="sticky top-0 z-20 border-l border-border bg-slate-50 px-3 py-2 text-right text-[11px] font-semibold text-muted"
                      >
                        증감수
                      </th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const isChecked = selectedMedia.includes(row.media);
                    const baseRowClass = row.isPinned
                      ? isChecked
                        ? "bg-primary-500/[0.08]"
                        : "bg-primary-500/[0.06]"
                      : isChecked
                        ? "bg-slate-50"
                        : "bg-white";

                    return (
                      <tr key={row.media}>
                        <td
                          className={`${baseRowClass} border-b border-border px-3 py-3 text-center`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleMedia(row.media)}
                            className="h-4 w-4 rounded border-border text-primary-500 focus:ring-primary-500"
                            aria-label={`${row.media} 그래프 표시`}
                          />
                        </td>
                        <td
                          className={`${baseRowClass} border-b border-l border-border px-3 py-3 text-center text-xs font-semibold ${
                            row.isPinned ? "shadow-[inset_3px_0_0_0_#1E40AF]" : ""
                          }`}
                        >
                          {row.currentRank}
                        </td>
                        <td
                          className={`${baseRowClass} border-b border-l border-border px-3 py-3 text-center text-xs`}
                        >
                          <div className="leading-tight">
                            <p className="font-medium text-foreground">
                              {row.weekAgoRank == null ? "-" : row.weekAgoRank}
                            </p>
                            <p className="caption mt-1">
                              {formatRankDelta(row.rankDelta)}
                            </p>
                          </div>
                        </td>
                        <td
                          className={`${baseRowClass} border-b border-l border-border px-3 py-3`}
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
                          className={`${baseRowClass} border-b border-l border-border px-3 py-3 text-right font-medium text-foreground`}
                        >
                          {row.share.toFixed(3)}%
                        </td>
                        {row.tableSnapshots.flatMap((snapshot) => [
                          <td
                            key={`${row.media}-${snapshot.snapshotDate}-count`}
                            className={`${baseRowClass} border-b border-l border-border px-3 py-3 text-right font-medium text-foreground`}
                          >
                            {snapshot.subscriberCount == null
                              ? "-"
                              : snapshot.subscriberCount.toLocaleString()}
                          </td>,
                          <td
                            key={`${row.media}-${snapshot.snapshotDate}-delta`}
                            className={`${baseRowClass} border-b border-l border-border px-3 py-3 text-right font-medium ${
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

            {competitors.length > TOP_N && (
              <div className="border-t border-border px-4 py-3 text-center">
                <button
                  type="button"
                  onClick={() => setShowAll((current) => !current)}
                  className="text-sm font-semibold text-primary-500 hover:underline"
                >
                  {showAll ? "Top" : "More"}
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
