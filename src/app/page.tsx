import {
  Eye,
  Flame,
  MessageSquare,
  Users,
} from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { StatCard } from "@/components/dashboard/StatCard";
import { IssueCard } from "@/components/dashboard/IssueCard";
import { RankingList } from "@/components/dashboard/RankingList";
import { MissedAlerts } from "@/components/dashboard/MissedAlerts";
import { SubscriberChart } from "@/components/dashboard/SubscriberChart";
import { AISummaryCard } from "@/components/dashboard/AISummaryCard";
import {
  getOverviewStats,
  getIssues,
  getRecentArticles,
  getMissedAlerts,
  getOurSubscriberSeries,
  getTopComments,
  getLatestDailySummary,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

function weekdayKr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+09:00");
  return WEEKDAY_KR[d.getUTCDay()];
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
  const [stats, issues, recent, alerts, sub, topComments, aiSummary] =
    await Promise.all([
      getOverviewStats(),
      getIssues(4),
      getRecentArticles(8),
      getMissedAlerts("open", 5),
      getOurSubscriberSeries(7),
      getTopComments(4),
      getLatestDailySummary(),
    ]);

  const statCards = [
    {
      label: "자사 오늘 기사 (네이버)",
      value: stats.today_articles.toLocaleString(),
      delta: stats.today_articles_delta_pct,
      deltaLabel: "전일 대비",
      icon: Flame,
    },
    {
      label: "자사 총 구독자",
      value: stats.total_subscribers.toLocaleString(),
      delta: sub.deltaPct,
      deltaLabel: "7일 대비",
      icon: Eye,
    },
    {
      label: "자사 일일 구독자 증감",
      value:
        (stats.today_subscriber_delta >= 0 ? "+" : "") +
        stats.today_subscriber_delta.toLocaleString(),
      delta: 0,
      icon: Users,
    },
    {
      label: "댓글 반응 (전체)",
      value: stats.today_comments.toLocaleString(),
      delta: 0,
      icon: MessageSquare,
    },
  ];

  const issueCards = issues.map((i) => ({
    rank: i.rank,
    title: i.title,
    summary: i.summary ?? "",
    keywords: i.keywords,
    mentions: i.articles,
    mediaNames: i.mediaNames,
    mediaCount: i.mediaCount,
    trend: Math.round(i.confidence * 100),
  }));

  const rankingItems = recent.map((a, idx) => ({
    rank: idx + 1,
    title: a.title,
    media: a.media,
    change: null as number | null,
  }));

  const alertItems = alerts.map((a) => ({
    title: a.title,
    competitors: a.competitors.length > 0 ? a.competitors : ["경쟁사 미확인"],
    priority: a.priority,
    gapMinutes: a.gap_minutes,
  }));

  const subscriberSeries = sub.series.map((p) => ({
    day: weekdayKr(p.snapshot_date),
    value: p.subscriber_count,
  }));

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-6 py-6">
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
                issueCards.map((i) => <IssueCard key={i.rank} {...i} />)
              )}
            </div>
          </section>

          <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RankingList items={rankingItems} />
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
                  href="/analytics/comments"
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
                        <p className="truncate font-medium">{row.title}</p>
                        <p className="caption mt-0.5">
                          {row.media} · {row.comments.toLocaleString()}개 댓글
                        </p>
                      </div>
                      <span className="badge badge-muted">{row.source}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
