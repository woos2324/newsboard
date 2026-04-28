import Link from "next/link";
import { Layers } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { getIssues } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function IssuePage() {
  const issues = await getIssues(30);

  return (
    <PageShell
      title="이슈 분석"
      description="관련 기사 2건 이상인 오늘의 핵심 이슈 목록"
    >
      {issues.length === 0 ? (
        <div className="card">
          <p className="caption">관련 기사 2건 이상인 이슈가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {issues.map((i) => (
            <Link
              key={i.cluster_id}
              href={`/issue/${i.cluster_id}`}
              className="card card-hover block"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary-500">
                  <Layers className="h-3.5 w-3.5" />
                  클러스터 #{i.rank}
                </span>
                <span className="badge badge-muted">
                  신뢰도 {(i.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <h3 className="text-sm font-semibold">{i.title}</h3>
              <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">
                {i.summary ?? ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {i.keywords.map((k) => (
                  <span key={k} className="badge badge-muted">
                    #{k}
                  </span>
                ))}
              </div>
              <div className="mt-4">
                <p className="caption">보도 매체</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {i.mediaNames.map((media) => (
                    <span key={media} className="badge badge-muted">
                      {media}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-4 border-t border-border pt-3 text-xs text-muted">
                관련 기사 {i.articles}건 · 매체 {i.mediaCount}곳 · {i.cluster_date}
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
