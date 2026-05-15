import { AlertTriangle, Clock, ExternalLink, CheckCircle } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { getMissedAlerts } from "@/lib/queries";
import { ReviewButton } from "./ReviewButton";

export const revalidate = 300

const badgeByPriority: Record<
  "high" | "medium" | "low",
  { cls: string; label: string }
> = {
  high: { cls: "badge-error", label: "높음" },
  medium: { cls: "badge-warning", label: "보통" },
  low: { cls: "badge-muted", label: "낮음" },
};

const verdictConfig: Record<string, { cls: string; label: string }> = {
  "미보도": { cls: "badge-error", label: "미보도" },
  "확인필요": { cls: "badge-warning", label: "확인필요" },
  "유사보도있음": { cls: "badge-muted", label: "유사보도있음" },
};

export default async function GapPage() {
  const allAlerts = await getMissedAlerts("all", 50);
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const alerts = allAlerts.filter((a) => {
    if (a.status === "reviewing") return true;
    if (a.status === "open") return a.detected_at >= twoDaysAgo;
    return false;
  });

  return (
    <PageShell
      title="미보도 탐지"
      description="경쟁사가 보도했지만 자사가 놓친 이슈를 우선순위별로 표시합니다."
    >
      {alerts.length === 0 ? (
        <div className="card">
          <p className="caption">현재 열린 낙종 알림이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {alerts.map((a) => {
            const badge = badgeByPriority[a.priority];
            const vConfig = a.verdict ? verdictConfig[a.verdict] : null;
            const isReviewing = a.status === "reviewing";
            const isMissed = !a.verdict || a.verdict === "미보도";
            const simPct = a.reason?.match(/유사도 (\d+%)/)?.[1] ?? null;

            return (
              <article
                key={a.alert_id}
                className={`card ${isMissed && a.priority === "high" && !isReviewing ? "card-alert" : ""} ${isReviewing ? "opacity-70" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isMissed && a.priority === "high" && !isReviewing
                        ? "bg-error/10 text-error"
                        : a.verdict === "유사보도있음"
                        ? "bg-success/10 text-success"
                        : "bg-muted/10 text-muted"
                    }`}
                  >
                    {a.verdict === "유사보도있음" ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    {/* 제목 + 배지 */}
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{a.title}</h3>
                      {vConfig && (
                        <span className={`badge ${vConfig.cls}`}>{vConfig.label}</span>
                      )}
                      <span className={`badge ${badge.cls}`}>{badge.label}</span>
                    </div>

                    {/* reason */}
                    <p className="mt-1 text-[13px] text-muted">
                      {`경쟁사 ${a.competitors.length}개 매체 보도${isMissed ? ", 자사 미보도" : ""}`}
                    </p>

                    {/* 자사 유사 기사 링크 */}
                    {a.similar_article && (
                      <a
                        href={a.similar_article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-primary-500 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        자사 유사 기사: {a.similar_article.title.length > 35
                          ? a.similar_article.title.slice(0, 35) + "…"
                          : a.similar_article.title}
                        {simPct && <span className="ml-1 font-normal">(유사도 {simPct})</span>}
                      </a>
                    )}

                    {/* 메타: 탐지 시간 + 경쟁사 링크 */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        탐지 {a.gap_minutes}분 전
                      </span>
                      {a.competitors.length > 0 && (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          <span>경쟁사:</span>
                          {a.competitors.map((c, idx) => (
                            <span key={c.name} className="inline-flex items-center gap-0.5">
                              {c.url ? (
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-primary-500 hover:underline"
                                >
                                  {c.name}
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              ) : (
                                <span>{c.name}</span>
                              )}
                              {idx < a.competitors.length - 1 && <span className="text-border">,</span>}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>

                  <ReviewButton alertId={a.alert_id} status={a.status} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
