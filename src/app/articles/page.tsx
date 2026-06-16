import { PageShell } from "@/components/PageShell";
import { getOurArticlesPage, getOldestArticleDate, sectionLabel } from "@/lib/queries";
import { ArticleDateNav } from "./ArticleDateNav";
import { ArticleListClient } from "./ArticleListClient";

export const revalidate = 300

const PER_PAGE = 10;

const SECTION_BAR_COLORS: Record<string, string> = {
  politics: "#8B5CF6",
  economy: "#EF4444",
  society: "#F59E0B",
  culture: "#EC4899",
  it: "#10B981",
  world: "#3B82F6",
  entertainment: "#D946EF",
  sports: "#F97316",
  opinion: "#64748B",
};

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  return kst.toISOString().slice(0, 10);
}

type Props = { searchParams: Promise<{ date?: string }> };

export default async function ArticlesPage({ searchParams }: Props) {
  const params = await searchParams;
  const date = params.date ?? todayKST();

  const [data, oldestDate] = await Promise.all([
    getOurArticlesPage(date, 1, PER_PAGE),
    getOldestArticleDate(),
  ]);
  const totalPages = Math.ceil(data.total / PER_PAGE);
  const maxSection = data.sectionCounts[0]?.count ?? 1;

  const delta = data.total - data.prevDayTotal;
  const deltaStr =
    delta === 0 ? "" : delta > 0 ? `▲ 전일 대비 +${delta}건` : `▼ 전일 대비 ${delta}건`;

  return (
    <PageShell>

      {/* 헤더: 모바일은 세로 스택, sm+ 는 title 좌측·날짜 네비 우측 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">자사 기사 현황</h1>
          <p className="mt-1 text-sm text-muted">세계일보가 네이버에 발행한 기사 목록과 섹션별 현황</p>
        </div>
        <div className="sm:shrink-0">
          <ArticleDateNav date={date} minDate={oldestDate ?? undefined} />
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="card">
          <p className="caption">오늘 발행 기사</p>
          <p className="mt-1 text-2xl font-bold">{data.total}건</p>
          {deltaStr && (
            <p className={`mt-1 text-xs ${delta > 0 ? "text-success" : "text-error"}`}>{deltaStr}</p>
          )}
        </div>
        <div className="card">
          <p className="caption">이슈 연결 기사</p>
          <p className="mt-1 text-2xl font-bold">{data.issueLinked}건</p>
          <p className="mt-1 text-xs text-muted">
            {data.total > 0 ? `전체의 ${Math.round((data.issueLinked / data.total) * 100)}%` : "-"}
          </p>
        </div>
        <div className="card">
          <p className="caption">수집 섹션 수</p>
          <p className="mt-1 text-2xl font-bold">{data.sectionCounts.length}개</p>
          <p className="mt-1 text-xs text-muted">
            {data.sectionCounts[0] ? `최다: ${sectionLabel(data.sectionCounts[0].section)}` : "-"}
          </p>
        </div>
        <div className="card">
          <p className="caption">전체 페이지</p>
          <p className="mt-1 text-2xl font-bold">{totalPages}페이지</p>
          <p className="mt-1 text-xs text-muted">{PER_PAGE}건씩 표시</p>
        </div>
      </div>

      {/* 차트 + 섹션 분포 */}
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <p className="section-title">최근 7일 발행 추이</p>
          <p className="caption mb-4">일별 네이버 발행 기사 수</p>
          {data.trend.length === 0 ? (
            <p className="caption">데이터 없음</p>
          ) : (
            <div className="flex h-44 items-end gap-2">
              {data.trend.map((t) => {
                const BAR_MAX_PX = 140;
                const barPx = Math.max(4, Math.round((t.count / 600) * BAR_MAX_PX));
                const isToday = t.date === date;
                const [, m, d] = t.date.split("-");
                return (
                  <div key={t.date} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold text-muted">{t.count}</span>
                    <div
                      className={`w-full rounded-t-sm ${isToday ? "bg-primary-500" : "bg-blue-200"}`}
                      style={{ height: barPx }}
                    />
                    <span className={`text-[10px] ${isToday ? "font-bold text-primary-500" : "text-muted"}`}>
                      {parseInt(m)}/{parseInt(d)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <p className="section-title">섹션별 분포</p>
          <p className="caption mb-4">발행 기사 섹션 비중</p>
          {data.sectionCounts.length === 0 ? (
            <p className="caption">데이터 없음</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.sectionCounts.map(({ section, count }) => (
                <div key={section} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-xs text-foreground">{sectionLabel(section)}</span>
                  <div className="flex-1 overflow-hidden rounded-full bg-gray-100" style={{ height: 8 }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round((count / maxSection) * 100)}%`,
                        background: SECTION_BAR_COLORS[section] ?? "#6B7280",
                      }}
                    />
                  </div>
                  <span className="w-5 shrink-0 text-right text-xs text-muted">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 기사 목록 */}
      <div className="card">
        <p className="section-title mb-4">기사 목록</p>
        <ArticleListClient date={date} initialArticles={data.articles} total={data.total} />
      </div>
    </PageShell>
  );
}
