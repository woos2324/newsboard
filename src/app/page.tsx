import {
  Eye,
  Flame,
  MessageSquare,
  Users,
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/dashboard/StatCard";
import { IssueCard } from "@/components/dashboard/IssueCard";
import { RankingList } from "@/components/dashboard/RankingList";
import { MissedAlerts } from "@/components/dashboard/MissedAlerts";
import { SubscriberChart } from "@/components/dashboard/SubscriberChart";
import { AISummaryCard } from "@/components/dashboard/AISummaryCard";
import { TrendingKeywords } from "@/components/dashboard/TrendingKeywords";
import {
  getDashboardData,
  getDailyCvHistory,
  getTrendingKeywords,
} from "@/lib/queries";
import { getCurrentProfile } from "@/lib/auth";
import { canAccessPath, type Role } from "@/lib/roles";

export const revalidate = 300

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

function weekdayKr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+09:00");
  return WEEKDAY_KR[d.getUTCDay()];
}

function todayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60_000);
  return kst.toISOString().slice(0, 10);
}

function formatDateTimeKr(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const role = (profile?.role ?? "reporter") as Role;

  const [dashboard, pvHistory, trending] = await Promise.all([
    getDashboardData(),
    getDailyCvHistory(3),
    getTrendingKeywords(),
  ]);
  const { stats, issues, rankingNews, alerts, sub, topComments, aiSummary } = dashboard;

  const linkIfAllowed = (path: string) =>
    canAccessPath(role, path) ? path : undefined;

  const trendingByCluster = new Map(
    trending
      .filter((t) => t.matched_cluster_id !== null)
      .map((t) => [t.matched_cluster_id!, t.approx_traffic])
  );

  // 조회수 카드: 오늘 실시간 데이터가 있으면 오늘 누적 PV(전일 종일 대비),
  // 없으면(자정 직후 등) 전일 확정값(전전일 대비)으로 fallback
  const pvTodayStr = todayKST();
  const pvRealtimeRow = pvHistory.find((p) => p.data_date === pvTodayStr && p.total > 0);
  const pvPastRows = pvHistory.filter((p) => p.data_date !== pvTodayStr);
  const pvIsRealtime = !!pvRealtimeRow;
  const pvValue = pvIsRealtime ? pvRealtimeRow!.total : (pvPastRows[0]?.total ?? 0);
  const pvBase = pvIsRealtime ? (pvPastRows[0]?.total ?? 0) : (pvPastRows[1]?.total ?? 0);
  const pvDeltaPct = pvBase > 0
    ? Number((((pvValue - pvBase) / pvBase) * 100).toFixed(1))
    : 0;
  const pvSublabel = pvIsRealtime ? "오늘 실시간" : "전일 기준";
  const pvDeltaLabel = pvIsRealtime ? "전일 종일 대비" : "전일 대비";

  const statCards = [
    {
      label: "자사 오늘 기사 (네이버)",
      value: stats.today_articles.toLocaleString(),
      delta: stats.today_articles_delta_pct,
      deltaLabel: "전일 대비",
      icon: Flame,
      href: linkIfAllowed("/articles"),
    },
    {
      label: "조회수",
      sublabel: pvSublabel,
      value: pvValue > 0 ? pvValue.toLocaleString() : "—",
      delta: pvDeltaPct,
      deltaLabel: pvDeltaLabel,
      icon: Eye,
      href: linkIfAllowed("/traffic"),
    },
    {
      label: "자사 총 구독자",
      value: stats.total_subscribers.toLocaleString(),
      delta: sub.deltaPct,
      deltaLabel: "7일 대비",
      icon: Users,
      href: linkIfAllowed("/analytics/subscribers"),
    },
    {
      label: "댓글 반응 (전체)",
      value: stats.today_comments.toLocaleString(),
      delta: 0,
      icon: MessageSquare,
      href: linkIfAllowed("/compare"),
    },
  ];

  const issueCards = issues.map((i) => ({
    cluster_id: i.cluster_id,
    rank: i.rank,
    title: i.title,
    summary: i.summary ?? "",
    keywords: i.keywords,
    mentions: i.articles,
    mediaNames: i.mediaNames,
    mediaCount: i.mediaCount,
    trend: Math.round(i.confidence * 100),
    trendingTraffic: trendingByCluster.get(i.cluster_id),
  }));


  const alertItems = alerts.map((a) => ({
    title: a.title,
    competitors: a.competitors.length > 0 ? a.competitors.map((c) => c.name) : ["경쟁사 미확인"],
    priority: a.priority,
    gapMinutes: a.gap_minutes,
  }));

  const subscriberSeries = sub.series.map((p) => ({
    day: weekdayKr(p.snapshot_date),
    value: p.subscriber_count,
  }));

  return (
    <AppShell>
      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight">
              Overview Dashboard
            </h1>
            <p className="mt-1 text-sm text-muted">
              오늘의 미디어 트렌드와 주요 지표를 한눈에 확인하세요.
            </p>
          </div>

          <section
            aria-label="주요 지표"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {statCards.map((s) => (
              <StatCard key={s.label} {...s} />
            ))}
          </section>

          <section className="mt-6">
            <AISummaryCard
              updatedAt={
                aiSummary
                  ? formatDateTimeKr(aiSummary.summary_date + "T09:00:00+09:00")
                  : "-"
              }
              title={aiSummary?.title}
              summary={
                aiSummary?.content ??
                "오늘의 AI 요약이 아직 생성되지 않았습니다."
              }
              bullets={aiSummary?.bullets ?? []}
            />
          </section>

          <section className="mt-6">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h2 className="section-title">주요 이슈</h2>
                <p className="caption">
                  관련 기사 2건 이상인 오늘의 핵심 이슈
                </p>
              </div>
              <a
                href="/issue"
                className="text-xs font-medium text-primary-500 hover:underline"
              >
                전체 이슈 →
              </a>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {issueCards.length === 0 ? (
                <p className="caption col-span-full">
                  관련 기사 2건 이상인 이슈 데이터가 없습니다.
                </p>
              ) : (
                issueCards.map((i) => (
                  <Link key={i.rank} href={`/issue/${i.cluster_id}`} className="block">
                    <IssueCard {...i} />
                  </Link>
                ))
              )}
            </div>
          </section>

          {trending.length > 0 && (
            <section className="mt-6">
              <TrendingKeywords
                items={trending}
                fetchedAt={trending[0].fetched_at}
              />
            </section>
          )}

          <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RankingList items={rankingNews} />
            </div>
            <MissedAlerts items={alertItems} />
          </section>

          <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SubscriberChart
              data={
                subscriberSeries.length > 0
                  ? subscriberSeries
                  : [{ day: "-", value: 0 }]
              }
              total={sub.total.toLocaleString()}
              delta={sub.deltaPct}
            />
            <div className="card lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="section-title">인기 댓글 기사</h2>
                  <p className="caption">댓글 반응이 가장 활발한 기사</p>
                </div>
                <a
                  href="/compare"
                  className="text-xs font-medium text-primary-500 hover:underline"
                >
                  더 보기 →
                </a>
              </div>
              <ul className="divide-y divide-border">
                {topComments.length === 0 ? (
                  <li className="caption py-3">댓글 데이터가 없습니다.</li>
                ) : (
                  topComments.map((row) => (
                    <li
                      key={row.article_id}
                      className="flex items-center gap-3 py-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        {row.url ? (
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate font-medium hover:text-primary-500 hover:underline"
                          >
                            {row.title}
                          </a>
                        ) : (
                          <p className="truncate font-medium">{row.title}</p>
                        )}
                        <p className="caption mt-0.5">
                          {row.media} · {row.comments.toLocaleString()}개 댓글
                        </p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </section>
      </main>
    </AppShell>
  );
}
