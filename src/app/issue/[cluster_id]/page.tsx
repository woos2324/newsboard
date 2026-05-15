import { ArrowLeft, ExternalLink, Layers, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { GenerateReportButton } from "@/components/GenerateReportButton";
import { getIssueDetail, getIssueAISummary } from "@/lib/queries";

export const revalidate = 300

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}.${m}.${day} ${hh}:${mm}`;
}

type Params = Promise<{ cluster_id: string }>;

export default async function IssueDetailPage({
  params,
}: {
  params: Params;
}) {
  const { cluster_id } = await params;
  const clusterId = Number(cluster_id);
  if (!Number.isFinite(clusterId)) notFound();

  const [detail, aiSummary] = await Promise.all([
    getIssueDetail(clusterId),
    getIssueAISummary(clusterId),
  ]);

  if (!detail) notFound();

  return (
    <PageShell
      title={detail.title}
      description={`클러스터 키 ${detail.cluster_key} · ${detail.cluster_date}`}
    >
      <div className="mb-4">
        <Link
          href="/issue"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          이슈 목록
        </Link>
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary-500">
              <Layers className="h-3.5 w-3.5" />
              이슈 클러스터
            </span>
            <span className="badge badge-muted">
              신뢰도 {(detail.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <h2 className="text-base font-semibold">{detail.title}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {detail.summary ?? "요약이 없습니다."}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {detail.keywords.map((k) => (
              <span key={k} className="badge badge-muted">
                #{k}
              </span>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3 text-xs">
            <div>
              <p className="caption">관련 기사</p>
              <p className="mt-0.5 text-sm font-semibold">
                {detail.articles.length}건
              </p>
            </div>
            <div>
              <p className="caption">보도 매체</p>
              <p className="mt-0.5 text-sm font-semibold">
                {detail.competitor_count}곳
              </p>
            </div>
            <div>
              <p className="caption">모델</p>
              <p className="mt-0.5 truncate text-sm font-semibold">
                {detail.model_version || "-"}
              </p>
            </div>
          </div>
        </div>

        <div className="card relative overflow-hidden bg-gradient-to-br from-primary-500 to-primary-600 text-white">
          <div
            aria-hidden
            className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl"
          />
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/15">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs font-medium">AI 이슈 요약</span>
              {aiSummary && (
                <span className="ml-auto text-[11px] text-white/70">
                  {aiSummary.summary_date}
                </span>
              )}
            </div>

            {aiSummary ? (
              <>
                {aiSummary.title && (
                  <p className="mt-3 text-sm font-semibold">
                    {aiSummary.title}
                  </p>
                )}
                <p className="mt-2 text-[13px] leading-relaxed text-white/90">
                  {aiSummary.content}
                </p>
                {aiSummary.bullets.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {aiSummary.bullets.map((b, idx) => (
                      <li
                        key={idx}
                        className="flex gap-2 text-[13px] leading-relaxed text-white/90"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/70" />
                        {b.text}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[11px] text-white/70">
                  모델 {aiSummary.model_version}
                </p>
              </>
            ) : (
              <p className="mt-3 text-[13px] leading-relaxed text-white/85">
                아직 이 이슈에 대한 AI 요약이 없습니다. 아래 버튼으로 생성하세요.
              </p>
            )}

            <div className="mt-4">
              <GenerateReportButton
                kind="issue"
                clusterId={detail.cluster_id}
                label={aiSummary ? "다시 생성" : "이 이슈 요약 생성"}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="section-title">관련 기사</h2>
            <p className="caption">유사도 순 정렬</p>
          </div>
          <span className="caption">{detail.articles.length}건</span>
        </div>

        {detail.articles.length === 0 ? (
          <div className="card">
            <p className="caption">연결된 기사가 없습니다.</p>
          </div>
        ) : (
          <div className="card">
            <ul className="divide-y divide-border">
              {detail.articles.map((a) => (
                <li
                  key={a.article_id}
                  className="flex items-start gap-3 py-3 text-sm"
                >
                  {a.is_representative && (
                    <span
                      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary-500/10 text-primary-500"
                      aria-label="대표 기사"
                      title="대표 기사"
                    >
                      <Star className="h-3 w-3" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center gap-1 font-medium hover:underline"
                    >
                      <span className="truncate">{a.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted" />
                    </a>
                    <p className="caption mt-0.5">
                      {a.media}
                      {a.category ? ` · ${a.category}` : ""}
                      {a.published_at
                        ? ` · ${formatDateTime(a.published_at)}`
                        : ""}
                    </p>
                  </div>
                  {a.similarity != null && (
                    <span className="badge badge-muted shrink-0">
                      유사도 {(a.similarity * 100).toFixed(0)}%
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </PageShell>
  );
}
