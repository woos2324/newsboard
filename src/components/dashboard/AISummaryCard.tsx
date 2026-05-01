import { Sparkles, FileText } from "lucide-react";
import type { SummarySource } from "@/lib/queries";

type Props = {
  updatedAt: string;
  title?: string;
  summary: string;
  bullets: string[];
  sources?: SummarySource[];
};

export function AISummaryCard({ updatedAt, title, summary, bullets, sources = [] }: Props) {
  return (
    <div className="card relative overflow-hidden bg-gradient-to-br from-primary-500 to-primary-600 text-white">
      <div
        aria-hidden
        className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl"
      />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/15">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-medium">AI 일간 요약</span>
          {title && (
            <span className="ml-3 text-xs font-semibold">{title}</span>
          )}
          <span className="ml-auto text-[11px] text-white/70">{updatedAt}</span>
          <button
            type="button"
            className="ml-3 rounded-lg bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25"
          >
            전체 리포트 →
          </button>
        </div>

        <p className="mt-3 text-sm font-medium leading-relaxed">{summary}</p>

        {bullets.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {bullets.map((b) => (
              <li
                key={b}
                className="flex gap-2 text-[13px] leading-relaxed text-white/90"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/70" />
                {b}
              </li>
            ))}
          </ul>
        )}

        {sources.length > 0 && (
          <div className="relative mt-3 inline-block group">
            <button
              type="button"
              className="flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-[11px] text-white/80 hover:bg-white/25 hover:text-white transition-colors"
            >
              <FileText className="h-3 w-3" />
              <span>참고 이슈 {sources.length}건</span>
            </button>
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-20 w-72">
              <div className="rounded-lg bg-white shadow-xl border border-border p-2">
                <p className="mb-1.5 px-1 text-[10px] font-semibold text-muted uppercase tracking-wide">
                  요약에 사용된 이슈
                </p>
                <ul className="space-y-0.5">
                  {sources.map((s) => (
                    <li key={s.cluster_id}>
                      <a
                        href={`/issue/${s.cluster_id}`}
                        className="block truncate rounded px-2 py-1.5 text-[12px] text-foreground hover:bg-gray-50 hover:text-primary-500"
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
