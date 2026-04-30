import { MessageSquare, ThumbsUp } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import {
  getOurTopComments,
  getCompetitorTopComments,
  type TopCommentView,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

function engagementBadge(comments: number): { cls: string; label: string } {
  if (comments >= 500) return { cls: "badge-error", label: "매우 활발" };
  if (comments >= 200) return { cls: "badge-warning", label: "활발" };
  return { cls: "badge-muted", label: "보통" };
}

function OurCommentCard({ item, rank }: { item: TopCommentView; rank: number }) {
  const badge = engagementBadge(item.comments);
  return (
    <a
      href={item.url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="card card-hover flex h-full flex-col"
    >
      <div className="flex items-start gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-500 text-[11px] font-semibold text-white">
          {rank}
        </span>
        <h3 className="line-clamp-3 text-sm font-semibold leading-snug">
          {item.title}
        </h3>
      </div>

      <div className="mt-auto pt-4">
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <MessageSquare className="h-3.5 w-3.5 text-primary-500" />
            {item.comments.toLocaleString()}
          </span>
          {item.likes != null && (
            <span className="flex items-center gap-1 text-muted">
              <ThumbsUp className="h-3.5 w-3.5" />
              {item.likes.toLocaleString()}
            </span>
          )}
          <span className={`badge ${badge.cls} ml-auto`}>{badge.label}</span>
        </div>
      </div>
    </a>
  );
}

function CompetitorSection({ media, articles }: { media: string; articles: TopCommentView[] }) {
  return (
    <div className="card">
      <h3 className="section-title mb-3">{media}</h3>
      {articles.length === 0 ? (
        <p className="caption">댓글 데이터가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border">
          {articles.map((row, i) => {
            const badge = engagementBadge(row.comments);
            return (
              <li key={row.article_id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="w-4 shrink-0 text-center text-xs font-medium text-muted">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={row.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-medium hover:text-primary-500 hover:underline block"
                  >
                    {row.title}
                  </a>
                  <p className="caption mt-0.5 flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {row.comments.toLocaleString()}
                    </span>
                    {row.likes != null && (
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" />
                        {row.likes.toLocaleString()}
                      </span>
                    )}
                  </p>
                </div>
                <span className={`badge ${badge.cls}`}>{badge.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default async function CommentsPage() {
  const [ourArticles, competitors] = await Promise.all([
    getOurTopComments(4),
    getCompetitorTopComments(5),
  ]);

  return (
    <PageShell
      title="독자 반응"
      description="댓글·좋아요 기준 인기 기사와 경쟁사 독자 반응을 비교합니다."
    >
      {/* 자사 영역 */}
      <section aria-label="자사 독자 반응">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="section-title">자사 최다 댓글 기사</h2>
            <p className="caption">세계일보 — 댓글 반응 TOP 4</p>
          </div>
          <span className="badge badge-muted">실시간 업데이트</span>
        </div>

        {ourArticles.length === 0 ? (
          <div className="card">
            <p className="caption">자사 댓글 지표 데이터가 없습니다. 수집 후 표시됩니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {ourArticles.map((item, i) => (
              <OurCommentCard key={item.article_id} item={item} rank={i + 1} />
            ))}
          </div>
        )}
      </section>

      {/* 구분선 */}
      <div className="my-8 flex items-center gap-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted">
          경쟁사 독자 반응
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* 경쟁사 영역 */}
      <section aria-label="경쟁사 독자 반응">
        <div className="mb-3">
          <h2 className="section-title">경쟁사 최다 댓글 기사</h2>
          <p className="caption">조선 · 중앙 · 동아 · 매경 — 매체별 TOP 5</p>
        </div>

        {competitors.length === 0 ? (
          <div className="card">
            <p className="caption">경쟁사 댓글 지표 데이터가 없습니다. 수집 후 표시됩니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {competitors.map((c) => (
              <CompetitorSection key={c.media} media={c.media} articles={c.articles} />
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}
