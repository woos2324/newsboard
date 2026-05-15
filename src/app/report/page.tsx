import { FileText, Sparkles } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { GenerateReportButton } from "@/components/GenerateReportButton";
import { getReports } from "@/lib/queries";

export const revalidate = 300

function formatDate(dateStr: string, type: string): string {
  if (type === "weekly") {
    const end = new Date(dateStr + "T00:00:00+09:00");
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    return `${start.toISOString().slice(0, 10).replace(/-/g, ".")} - ${end
      .toISOString()
      .slice(5, 10)
      .replace(/-/g, ".")}`;
  }
  return dateStr.replace(/-/g, ".");
}

function typeLabel(type: string): string {
  return type === "daily"
    ? "DAILY"
    : type === "weekly"
    ? "WEEKLY"
    : type.toUpperCase();
}

function typeTitle(type: string): string {
  return type === "daily"
    ? "일간 브리핑"
    : type === "weekly"
    ? "주간 리포트"
    : type === "issue"
    ? "이슈 요약"
    : type === "competitor"
    ? "경쟁사 요약"
    : "리포트";
}

export default async function ReportPage() {
  const reports = await getReports("all", 20);

  return (
    <PageShell
      title="AI 리포트"
      description="일간·주간 AI 자동 요약과 인사이트 브리핑"
    >
      <div className="mb-4 flex items-center justify-end">
        <GenerateReportButton kind="daily" />
      </div>
      {reports.length === 0 ? (
        <div className="card">
          <p className="caption">생성된 AI 리포트가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {reports.map((r) => (
            <article key={r.summary_id} className="card">
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary-500">
                  <Sparkles className="h-3.5 w-3.5" />
                  {typeLabel(r.type)} · {formatDate(r.summary_date, r.type)}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground"
                >
                  <FileText className="h-3.5 w-3.5" />
                  PDF
                </button>
              </div>
              <h3 className="text-base font-semibold">
                {r.title || typeTitle(r.type)}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                {r.content}
              </p>
              {r.bullets.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                  {r.bullets.map((b, idx) => (
                    <li key={idx} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
                      <span>{b.text}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 text-[11px] text-muted">
                모델 {r.model_version}
              </div>
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
