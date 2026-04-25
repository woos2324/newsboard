import { PageShell } from "@/components/PageShell";
import { getTopComments } from "@/lib/queries";

export const dynamic = "force-dynamic";

function engagementBadge(score: number | null): {
  cls: string;
  label: string;
} {
  if (score == null) return { cls: "badge-muted", label: "-" };
  if (score >= 80) return { cls: "badge-error", label: "매우 활발" };
  if (score >= 60) return { cls: "badge-warning", label: "활발" };
  return { cls: "badge-muted", label: "보통" };
}

export default async function CommentsPage() {
  const items = await getTopComments(20);

  return (
    <PageShell
      title="독자 반응"
      description="댓글 수 및 참여도 기준 인기 기사와 반응 분포를 확인합니다."
    >
      <div className="card">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="section-title">인기 댓글 기사 TOP {items.length}</h2>
            <p className="caption">오늘 기준 참여도 상위</p>
          </div>
          <span className="badge badge-muted">실시간 업데이트</span>
        </div>
        {items.length === 0 ? (
          <p className="caption">댓글 지표 데이터가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((row) => {
              const badge = engagementBadge(row.engagement);
              return (
                <li
                  key={row.article_id}
                  className="flex items-center gap-3 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.title}</p>
                    <p className="caption mt-0.5">
                      {row.media} · 댓글 {row.comments.toLocaleString()}개
                      {row.likes != null
                        ? ` · 좋아요 ${row.likes.toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                  <span className={`badge ${badge.cls}`}>{badge.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
