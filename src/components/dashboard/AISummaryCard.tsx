import { Sparkles, FileText } from "lucide-react";
import type { BulletItem } from "@/lib/queries";

type Props = {
  updatedAt: string;
  title?: string;
  summary: string;
  bullets: BulletItem[];
};

export function AISummaryCard({ updatedAt, title, summary, bullets }: Props) {
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
          <ul className="mt-3 space-y-2">
            {bullets.map((b, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[13px] leading-relaxed text-white/90"
              >
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-white/70" />
                <span className="flex-1">
                  {b.text}
                  {b.cluster_id != null && (
                    <span className="relative group inline-flex items-center align-middle ml-2.5">
                      <button
                        type="button"
                        className="flex h-5 w-5 items-center justify-center rounded bg-white/20 hover:bg-white/40 transition-colors"
                      >
                        <FileText className="h-3 w-3" />
                      </button>
                      <span className="absolute right-0 bottom-full pb-2 hidden group-hover:block z-20 pointer-events-auto">
                        <span className="w-60 rounded-lg bg-white shadow-xl border border-gray-100 overflow-hidden block">
                          <span className="px-3 py-2 bg-gray-50 border-b border-gray-100 block">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block">관련 이슈</span>
                          </span>
                          <a
                            href={`/issue/${b.cluster_id}`}
                            className="flex items-center gap-2 px-3 py-2.5 hover:bg-blue-50 transition-colors group/link"
                          >
                            <span className="text-[12px] text-gray-800 leading-snug group-hover/link:text-blue-700">
                              {b.cluster_title}
                            </span>
                            <svg className="h-3 w-3 shrink-0 text-gray-300 group-hover/link:text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path d="M7 17L17 7M7 7h10v10"/>
                            </svg>
                          </a>
                        </span>
                      </span>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
