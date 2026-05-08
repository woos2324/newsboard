import { TrendingUp } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { getTrendingWithCoverage } from "@/lib/queries";

export const dynamic = "force-dynamic";

const TRAFFIC_STYLE: Record<string, string> = {
  "1M+": "badge badge-error",
  "100K+": "badge badge-error",
  "10K+": "badge badge-warning",
  "1K+": "badge badge-muted",
  "200+": "badge badge-warning",
  "100+": "badge badge-muted",
};

function trafficClass(traffic: string) {
  return TRAFFIC_STYLE[traffic] ?? "badge badge-muted";
}

function formatFetchedAt(iso: string) {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m} 기준`;
}

export default async function TrendingPage() {
  const items = await getTrendingWithCoverage();

  const missed = items.filter((i) => !i.covered);
  const covered = items.filter((i) => i.covered);
  const fetchedAt = items[0]?.fetched_at;

  return (
    <PageShell
      title="실시간 트렌드"
      description="구글 급상승 검색어 기준 세계일보 보도 현황 · 10분마다 갱신"
    >
      {items.length === 0 ? (
        <p className="caption">트렌드 데이터가 없습니다. 잠시 후 다시 확인해 주세요.</p>
      ) : (
        <>
          {/* 헤더 우측 시간 */}
          <div className="mb-4 flex justify-end">
            <span className="caption">{formatFetchedAt(fetchedAt)}</span>
          </div>

          {/* 스탯 카드 */}
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="card text-center py-4">
              <p className="text-2xl font-bold">{items.length}</p>
              <p className="caption mt-1">전체 키워드</p>
            </div>
            <div className="card text-center py-4">
              <p className="text-2xl font-bold text-error">{missed.length}</p>
              <p className="caption mt-1">미보도</p>
            </div>
            <div className="card text-center py-4">
              <p className="text-2xl font-bold text-success">{covered.length}</p>
              <p className="caption mt-1">보도됨</p>
            </div>
          </div>

          {/* 전체 키워드 그리드 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {items.map((item) => {
              const relatedNews = (item.related_news ?? []) as {
                title: string;
                url: string;
                source: string;
              }[];

              return (
                <article
                  key={item.trending_id}
                  className="flex flex-col overflow-hidden rounded-xl border border-border bg-white"
                  style={{
                    borderTop: `3px solid ${item.covered ? "#16A34A" : "#DC2626"}`,
                  }}
                >
                  {/* 키워드 + 배지 */}
                  <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                    <span className="w-4 shrink-0 text-center text-xs font-bold text-muted">
                      {item.traffic_rank}
                    </span>
                    <span className="flex-1 truncate text-sm font-semibold">
                      {item.keyword}
                    </span>
                    <span className={`${item.covered ? "badge badge-success" : "badge badge-error"} shrink-0`}>
                      {item.covered ? "보도됨" : "미보도"}
                    </span>
                    <span className={`${trafficClass(item.approx_traffic)} shrink-0`}>
                      {item.approx_traffic}
                    </span>
                  </div>

                  {/* 보도 여부별 중간 영역 */}
                  <div className="min-h-[48px] px-3 pb-3 text-xs">
                    {item.covered ? (
                      <a
                        href={item.our_article_url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="line-clamp-2 text-primary-500 hover:underline"
                      >
                        📰 {item.our_article_title}
                      </a>
                    ) : item.ai_summary ? (
                      <p className="line-clamp-3 leading-relaxed text-foreground/70">{item.ai_summary}</p>
                    ) : (
                      <p className="italic text-muted">AI 요약 생성 중...</p>
                    )}
                  </div>

                  {/* 관련 뉴스 3건 */}
                  <div className="mt-auto">
                    {relatedNews.length === 0 ? (
                      <div className="border-t border-border px-3 py-2 text-xs text-muted">
                        관련 뉴스 없음
                      </div>
                    ) : (
                      relatedNews.map((news, idx) => (
                        <a
                          key={idx}
                          href={news.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-baseline gap-2 border-t border-border px-3 py-2 hover:bg-background"
                        >
                          <span className="flex-1 truncate text-xs text-foreground/80">
                            {news.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted">
                            {news.source}
                          </span>
                        </a>
                      ))
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </PageShell>
  );
}
