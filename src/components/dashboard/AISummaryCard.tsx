import { Sparkles } from "lucide-react";

type Props = {
  updatedAt: string;
  summary: string;
  bullets: string[];
};

export function AISummaryCard({ updatedAt, summary, bullets }: Props) {
  return (
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
          <span className="text-xs font-medium">AI 일간 요약</span>
          <span className="ml-auto text-[11px] text-white/70">{updatedAt}</span>
        </div>

        <p className="mt-3 text-sm font-medium leading-relaxed">{summary}</p>

        <ul className="mt-4 space-y-1.5">
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

        <button
          type="button"
          className="mt-4 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/25"
        >
          전체 리포트 보기 →
        </button>
      </div>
    </div>
  );
}
