import { PageShell } from "@/components/PageShell";
import { getTrafficPageData, getLatestTrafficDate, type TrafficPageData } from "@/lib/queries";
import { HourlyChart } from "./HourlyChart";
import { ArticleListModal } from "./ArticleListModal";
import { KeywordListModal } from "./KeywordListModal";
import { DateDeviceSelector } from "./DateDeviceSelector";

export const revalidate = 1800;

const SOURCE_COLORS = ["#1e40af", "#60a5fa", "#93c5fd", "#bfdbfe", "#dbeafe", "#e5e7eb"];
const ART_TOP = 25;
const KW_TOP = 15;

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  return kst.toISOString().slice(0, 10);
}

function fmtPv(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "만";
  return n.toLocaleString();
}

function deltaPct(curr: number, prev: number): number {
  if (!prev) return 0;
  return ((curr - prev) / prev) * 100;
}

function rankBadge(rank: number) {
  if (rank === 1) return "bg-amber-100 text-amber-700";
  if (rank === 2) return "bg-purple-100 text-purple-700";
  if (rank === 3) return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-500";
}

function buildConicGradient(sources: { category_ratio: number }[]) {
  let offset = 0;
  const segs = sources.map((s, i) => {
    const deg = (s.category_ratio / 100) * 360;
    const start = offset;
    offset += deg;
    return `${SOURCE_COLORS[i] ?? "#e5e7eb"} ${start.toFixed(1)}deg ${offset.toFixed(1)}deg`;
  });
  return `conic-gradient(${segs.join(", ")})`;
}

function fmtKST(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const VALID_DEVICES = ["all", "pc", "mobile"];

type Props = { searchParams: Promise<{ date?: string; device?: string }> };

export default async function TrafficPage({ searchParams }: Props) {
  const { date: rawDate, device: rawDevice } = await searchParams;
  const device = VALID_DEVICES.includes(rawDevice ?? "") ? (rawDevice as string) : "all";

  // 날짜 미지정 시 오늘 → 데이터 없으면 마지막 수집일로 fallback
  let date = rawDate ?? todayKST();
  if (!rawDate) {
    const latest = await getLatestTrafficDate();
    if (latest && latest < date) date = latest;
  }

  let data: TrafficPageData | null = null;
  let loadError = false;
  try {
    data = await getTrafficPageData(date, 100, 100, device);
  } catch {
    loadError = true;
  }

  const dateLabel = new Date(date + "T00:00:00+09:00").toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  if (loadError || !data) {
    return (
      <PageShell title="트래픽 분석" description="네이버 파트너센터 기준 · 매시 30분 자동 갱신">
        <div className="card text-sm text-muted py-8 text-center">
          {date} 데이터를 불러오지 못했습니다.
        </div>
      </PageShell>
    );
  }

  const {
    articles,
    hourlyToday,
    hourlyYesterday,
    trafficSources,
    keywords,
    totalPvTop100,
    prevTotalPvTop100,
    topArticlePv,
    searchRatio,
    totalHourlyToday,
  } = data;

  const noData = articles.length === 0 && hourlyToday.length === 0;

  const totalDelta = deltaPct(totalPvTop100, prevTotalPvTop100);
  const peakHour = hourlyToday.reduce(
    (best, h) => (h.pv > best.pv ? h : best),
    { hour: 0, pv: 0 }
  );
  const avgHourlyPv = hourlyToday.length
    ? Math.round(totalHourlyToday / hourlyToday.length)
    : 0;
  const peakVsAvg = avgHourlyPv ? deltaPct(peakHour.pv, avgHourlyPv) : 0;

  const topSource = trafficSources[0];
  const top25 = articles.slice(0, ART_TOP);
  const top15kw = keywords.slice(0, KW_TOP);
  const conicGradient = buildConicGradient(trafficSources);
  const maxKwClicks = top15kw[0]?.clicks ?? 1;

  return (
    <PageShell title="트래픽 분석" description="네이버 파트너센터 기준 · 매시 30분 자동 갱신">
      {/* Date subtitle + controls */}
      <div className="flex items-end justify-between gap-4 mb-5 -mt-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight leading-none mb-1">
            세계일보 트래픽 한눈에 보기
          </h2>
          <p className="text-sm text-muted">
            {dateLabel} · 일일 PV, 시간대별 흐름, 유입 경로, 검색 키워드를 한 화면에서 점검
          </p>
        </div>
        <DateDeviceSelector date={date} device={device} />
      </div>

      {noData ? (
        <div className="card text-sm text-muted py-8 text-center">
          {date} 수집 데이터가 없습니다. cron-naver-pv가 실행된 날짜를 확인해 주세요.
        </div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-4 gap-4 mb-5">
            {/* 총 PV */}
            <div className="card">
              <p className="text-xs text-muted mb-2">총 PV (Top {articles.length})</p>
              <p className="text-3xl font-bold leading-tight">
                {fmtPv(totalPvTop100)}
                <span className="text-sm font-medium text-muted ml-1">PV</span>
              </p>
              <div className="flex items-center gap-1 text-xs text-muted mt-1.5">
                <span className={`font-semibold ${totalDelta >= 0 ? "text-success" : "text-error"}`}>
                  {totalDelta >= 0 ? "▲" : "▼"} {Math.abs(totalDelta).toFixed(1)}%
                </span>
                전일 {fmtPv(prevTotalPvTop100)} 대비
              </div>
              <div className="mt-2.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${prevTotalPvTop100 ? Math.min(100, (totalPvTop100 / prevTotalPvTop100) * 80) : 80}%`,
                    background: "linear-gradient(90deg, #93c5fd, #1e3a8a)",
                  }}
                />
              </div>
            </div>

            {/* 1위 기사 PV */}
            <div className="card">
              <p className="text-xs text-muted mb-2">1위 기사 PV</p>
              <p className="text-3xl font-bold leading-tight">
                {fmtPv(topArticlePv)}
                <span className="text-sm font-medium text-muted ml-1">PV</span>
              </p>
              <p className="text-xs text-muted mt-1.5 line-clamp-1">
                {articles[0]?.reporter_name ?? "—"}
                {articles[0]?.title ? ` · ${articles[0].title.slice(0, 18)}…` : ""}
              </p>
              <div className="mt-2.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: "100%", background: "linear-gradient(90deg, #93c5fd, #1e3a8a)" }}
                />
              </div>
            </div>

            {/* 피크 시간 */}
            <div className="card">
              <p className="text-xs text-muted mb-2">피크 시간대</p>
              <p className="text-3xl font-bold leading-tight">
                {peakHour.hour}
                <span className="text-sm font-medium text-muted ml-1">시</span>
              </p>
              <p className="text-xs text-muted mt-1.5">
                {fmtPv(peakHour.pv)} PV · 평균 {peakVsAvg >= 0 ? "+" : ""}
                {peakVsAvg.toFixed(0)}%
              </p>
              <div className="mt-2.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: "90%", background: "linear-gradient(90deg, #93c5fd, #1e3a8a)" }}
                />
              </div>
            </div>

            {/* 검색 유입 비중 */}
            <div className="card">
              <p className="text-xs text-muted mb-2">검색 유입 비중</p>
              <p className="text-3xl font-bold leading-tight">
                {searchRatio.toFixed(1)}
                <span className="text-sm font-medium text-muted ml-1">%</span>
              </p>
              <p className="text-xs text-muted mt-1.5 line-clamp-1">
                {topSource
                  ? `${topSource.source_category} ${topSource.category_ratio.toFixed(1)}%`
                  : ""}
              </p>
              <div className="mt-2.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-yellow-400"
                  style={{ width: `${Math.min(100, searchRatio)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Row 1: Articles (7fr) / Hourly (5fr) */}
          <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: "7fr 5fr" }}>
            {/* Article PV Top 25 */}
            <div className="card">
              <div className="flex items-start justify-between gap-3 mb-3.5">
                <div>
                  <h3 className="text-sm font-semibold">인기 기사 Top {ART_TOP}</h3>
                  <div className="text-xs text-muted mt-0.5">PV 기준 · 클릭하면 원문 새 탭 열림</div>
                </div>
                <ArticleListModal
                  articles={articles}
                  totalPv={totalPvTop100}
                  topArticlePv={topArticlePv}
                  date={date}
                />
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-center text-[11px] text-muted uppercase tracking-wide font-medium pb-2 border-b border-border w-9">#</th>
                    <th className="text-left text-[11px] text-muted uppercase tracking-wide font-medium pb-2 border-b border-border px-2">기사</th>
                    <th className="text-left text-[11px] text-muted uppercase tracking-wide font-medium pb-2 border-b border-border w-48">PV</th>
                  </tr>
                </thead>
                <tbody>
                  {top25.map((a) => (
                    <tr key={a.rank} className="hover:bg-gray-50">
                      <td className="py-2.5 text-center border-b border-gray-50">
                        <span
                          className={`inline-grid place-items-center w-6 h-6 rounded-md text-xs font-semibold ${rankBadge(a.rank)}`}
                        >
                          {a.rank}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 border-b border-gray-50">
                        {a.article_url ? (
                          <a
                            href={a.article_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground font-medium leading-snug line-clamp-1 hover:text-primary"
                          >
                            {a.title}
                          </a>
                        ) : (
                          <span className="text-foreground font-medium leading-snug line-clamp-1">
                            {a.title}
                          </span>
                        )}
                        <div className="flex gap-2 text-[11px] text-muted mt-0.5">
                          <span>{a.reporter_name ?? "—"}</span>
                          <span>·</span>
                          <span>
                            {a.article_published_at ? fmtKST(a.article_published_at) : "—"}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 border-b border-gray-50">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${topArticlePv ? (a.pv / topArticlePv) * 100 : 0}%`,
                                background: "linear-gradient(90deg, #bfdbfe, #1e40af)",
                              }}
                            />
                          </div>
                          <div className="text-xs font-semibold tabular-nums w-16 text-right">
                            {a.pv.toLocaleString()}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Hourly Chart */}
            <HourlyChart
              hourlyToday={hourlyToday}
              hourlyYesterday={hourlyYesterday}
              date={date}
            />
          </div>

          {/* Row 2: Source (5fr) / Keywords (7fr) */}
          <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: "5fr 7fr" }}>
            {/* Traffic Source */}
            <div className="card">
              <div className="mb-3.5">
                <h3 className="text-sm font-semibold">유입 경로</h3>
                <div className="text-xs text-muted mt-0.5">전체 트래픽 기준 점유율(%)</div>
              </div>
              <div className="flex items-center gap-5 mb-4">
                {/* Donut */}
                <div
                  className="relative flex-shrink-0 w-36 h-36 rounded-full"
                  style={{ background: conicGradient }}
                >
                  <div className="absolute rounded-full bg-white" style={{ inset: 26 }} />
                  <div className="absolute inset-0 flex items-center justify-center text-center z-10">
                    <div>
                      <div className="text-lg font-bold leading-none">
                        {topSource ? topSource.category_ratio.toFixed(1) : "0"}%
                      </div>
                      <div
                        className="text-[11px] text-muted mt-1 leading-tight px-1"
                        style={{ maxWidth: 72 }}
                      >
                        {topSource?.source_category ?? "—"}
                      </div>
                    </div>
                  </div>
                </div>
                {/* Source list */}
                <div className="flex-1 flex flex-col gap-1.5">
                  {trafficSources.slice(0, 6).map((s, i) => (
                    <div key={s.source_category} className="flex items-center gap-2 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-[2px] flex-shrink-0"
                        style={{ background: SOURCE_COLORS[i] ?? "#e5e7eb" }}
                      />
                      <span className="flex-1 text-foreground line-clamp-1">
                        {s.source_category}
                      </span>
                      <span className="text-muted tabular-nums font-medium">
                        {s.category_ratio.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {topSource && (
                <div className="p-2.5 rounded-lg bg-blue-50 border border-indigo-100 text-xs text-blue-900 leading-relaxed">
                  <strong>{topSource.source_category}</strong> 의존도가{" "}
                  <strong>{topSource.category_ratio.toFixed(1)}%</strong>로 높음 · 검색 유입(
                  {searchRatio.toFixed(1)}%) 비중 확대 여지.
                </div>
              )}
            </div>

            {/* Search Keywords */}
            <div className="card">
              <div className="flex items-start justify-between gap-3 mb-3.5">
                <div>
                  <h3 className="text-sm font-semibold">검색 유입 키워드 Top {KW_TOP}</h3>
                  <div className="text-xs text-muted mt-0.5">
                    네이버 통합검색 기준 · 클릭 수 / 비중
                  </div>
                </div>
                <KeywordListModal keywords={keywords} date={date} />
              </div>
              {top15kw.length === 0 ? (
                <p className="text-xs text-muted">검색 키워드 데이터 없음</p>
              ) : (
                <table className="w-full border-collapse">
                  <tbody>
                    {top15kw.map((kw) => (
                      <tr key={kw.rank} className="hover:bg-gray-50">
                        <td className="py-2 text-xs text-muted tabular-nums w-6">{kw.rank}</td>
                        <td className="py-2 text-sm font-medium pr-2 w-28 truncate">
                          {kw.keyword}
                        </td>
                        <td className="py-2">
                          <div className="h-[5px] bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-700"
                              style={{
                                width: `${maxKwClicks ? (kw.clicks / maxKwClicks) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </td>
                        <td className="py-2 text-xs text-muted tabular-nums text-right w-16">
                          {kw.clicks.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between pt-4 border-t border-border text-xs text-muted mt-2">
            <span>데이터 출처 · 네이버 파트너센터 (news-stat-admin.navercorp.com)</span>
            <span>매시 30분 자동 갱신</span>
          </div>
        </>
      )}
    </PageShell>
  );
}
