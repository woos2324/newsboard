import { PageShell } from "@/components/PageShell";
import { getOurArticlesPage, sectionLabel } from "@/lib/queries";
import { ArticleDateNav } from "./ArticleDateNav";
import { ArticlePagination } from "./ArticlePagination";

export const dynamic = "force-dynamic";

const PER_PAGE = 10;

const SECTION_COLORS: Record<string, string> = {
  politics: "bg-violet-100 text-violet-700",
  economy: "bg-red-100 text-red-700",
  society: "bg-amber-100 text-amber-700",
  culture: "bg-pink-100 text-pink-700",
  it: "bg-emerald-100 text-emerald-700",
  world: "bg-blue-100 text-blue-700",
  entertainment: "bg-fuchsia-100 text-fuchsia-700",
  sports: "bg-orange-100 text-orange-700",
};

const SECTION_BAR_COLORS: Record<string, string> = {
  politics: "#8B5CF6",
  economy: "#EF4444",
  society: "#F59E0B",
  culture: "#EC4899",
  it: "#10B981",
  world: "#3B82F6",
  entertainment: "#D946EF",
  sports: "#F97316",
};

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  return kst.toISOString().slice(0, 10);
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

type Props = { searchParams: Promise<{ date?: string; page?: string }> };

export default async function ArticlesPage({ searchParams }: Props) {
  const params = await searchParams;
  const date = params.date ?? todayKST();
  const page = Math.max(1, parseInt(params.page ?? "1", 10));

  const data = await getOurArticlesPage(date, page, PER_PAGE);
  const totalPages = Math.ceil(data.total / PER_PAGE);
  const maxSection = data.sectionCounts[0]?.count ?? 1;

  const delta = data.total - data.prevDayTotal;
  const deltaStr = delta === 0 ? "" : delta > 0 ? `▲ 전일 대비 +${delta}건` : `▼ 전일 대비 ${delta}건`;

  // 좌/우 분리
  const left = data.articles.filter((_, i) => i % 2 === 0);
  const right = data.articles.filter((_, i) => i % 2 === 1);

  return (
    <PageShell title="자사 기사 현황" description="세계일보가 네이버에 발행한 기사 목록과 섹션별 현황">

      {/* 통계 카드 */}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="card">
          <p className="caption">오늘 발행 기사</p>
          <p className="mt-1 text-2xl font-bold">{data.total}건</p>
          {deltaStr && <p className={`mt-1 text-xs ${delta > 0 ? "text-success" : "text-error"}`}>{deltaStr}</p>}
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
        {/* 7일 추이 */}
        <div className="card lg:col-span-2">
          <p className="section-title">최근 7일 발행 추이</p>
          <p className="caption mb-4">일별 네이버 발행 기사 수</p>
          {data.trend.length === 0 ? (
            <p className="caption">데이터 없음</p>
          ) : (
            <div className="flex h-28 items-end gap-2">
              {(() => {
                const CHART_MAX = 600;
                return data.trend.map((t) => {
                const heightPct = Math.round((t.count / CHART_MAX) * 100);
                const isToday = t.date === date;
                const [, m, d] = t.date.split("-");
                return (
                  <div key={t.date} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold text-muted">{t.count}</span>
                    <div
                      className={`w-full rounded-t-sm ${isToday ? "bg-primary-500" : "bg-blue-200"}`}
                      style={{ height: `${heightPct}%`, minHeight: 4 }}
                    />
                    <span className={`text-[10px] ${isToday ? "font-bold text-primary-500" : "text-muted"}`}>
                      {parseInt(m)}/{parseInt(d)}
                    </span>
                  </div>
                );
              });
              })()}
            </div>
          )}
        </div>

        {/* 섹션 분포 */}
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
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="section-title">기사 목록</p>
            <p className="caption">총 {data.total}건 · {page}/{totalPages}페이지</p>
          </div>
        </div>

        {data.articles.length === 0 ? (
          <p className="caption">해당 날짜의 기사가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
            {/* 좌측 */}
            <div className="divide-y divide-border md:border-r md:border-border">
              {left.map((a, i) => (
                <ArticleRow key={a.article_id} num={(page - 1) * PER_PAGE + i * 2 + 1} article={a} sectionColors={SECTION_COLORS} />
              ))}
            </div>
            {/* 우측 */}
            <div className="divide-y divide-border">
              {right.map((a, i) => (
                <ArticleRow key={a.article_id} num={(page - 1) * PER_PAGE + i * 2 + 2} article={a} sectionColors={SECTION_COLORS} />
              ))}
            </div>
          </div>
        )}

        {/* 페이징 + 날짜 이동 */}
        <div className="flex flex-col items-center gap-4 border-t border-border pt-5 mt-2">
          <ArticlePagination date={date} page={page} totalPages={totalPages} />
          <ArticleDateNav date={date} />
        </div>
      </div>
    </PageShell>
  );
}

type ArticleRowProps = {
  num: number;
  article: { article_id: number; title: string; url: string | null; category: string | null; published_at: string | null; cluster_id: number | null };
  sectionColors: Record<string, string>;
};

function ArticleRow({ num, article, sectionColors }: ArticleRowProps) {
  const secCls = sectionColors[article.category ?? ""] ?? "bg-gray-100 text-gray-500";
  return (
    <div className="flex items-start gap-2.5 px-4 py-3">
      <span className="mt-0.5 w-5 shrink-0 text-xs font-semibold text-muted/60">{num}</span>
      <div className="min-w-0 flex-1">
        {article.url ? (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[13px] font-medium leading-snug text-foreground hover:text-primary-500 hover:underline"
          >
            {article.title}
          </a>
        ) : (
          <p className="text-[13px] font-medium leading-snug">{article.title}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {article.published_at && (
            <span className="text-[11px] text-muted">{formatTime(article.published_at)}</span>
          )}
          {article.category && (
            <span className={`badge text-[10px] ${secCls}`}>{sectionLabel(article.category)}</span>
          )}
          {article.cluster_id && (
            <span className="badge badge-muted text-[10px] text-primary-500">이슈 #{article.cluster_id}</span>
          )}
          {article.url && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted hover:text-primary-500"
            >
              ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
