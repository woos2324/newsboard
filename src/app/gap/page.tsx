import { AlertTriangle, Clock } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { getMissedAlerts } from "@/lib/queries";
import { ReviewButton } from "./ReviewButton";

export const dynamic = "force-dynamic";

const badgeByPriority: Record<
  "high" | "medium" | "low",
  { cls: string; label: string }
> = {
  high: { cls: "badge-error", label: "높음" },
  medium: { cls: "badge-warning", label: "보통" },
  low: { cls: "badge-muted", label: "낮음" },
};

export default async function GapPage() {
  const allAlerts = await getMissedAlerts("all", 50);
  const alerts = allAlerts.filter((a) => a.status === "open" || a.status === "reviewing");

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
            const isReviewing = a.status === "reviewing";
            return (
              <article
                key={a.alert_id}
                className={`card ${a.priority === "high" && !isReviewing ? "card-alert" : ""} ${isReviewing ? "opacity-70" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg ${
                      a.priority === "high" && !isReviewing
                        ? "bg-error/10 text-error"
                        : "bg-muted/10 text-muted"
                    }`}
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{a.title}</h3>
                      <span className={`badge ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-muted">
                      {a.reason ?? "-"}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        탐지 {a.gap_minutes}분 전
                      </span>
                      <span>
                        경쟁사:{" "}
                        {a.competitors.length > 0
                          ? a.competitors.join(", ")
                          : "미확인"}
                      </span>
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
