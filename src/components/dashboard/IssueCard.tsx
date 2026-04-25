import { TrendingUp } from "lucide-react";

type Props = {
  rank: number;
  title: string;
  summary: string;
  keywords: string[];
  mentions: number;
  trend: number;
};

export function IssueCard({
  rank,
  title,
  summary,
  keywords,
  mentions,
  trend,
}: Props) {
  return (
    <article className="card card-hover cursor-pointer">
      <div className="flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-500 text-[11px] font-semibold text-white">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">
            {summary}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {keywords.map((k) => (
          <span key={k} className="badge badge-muted">
            #{k}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
        <span className="text-muted">{mentions.toLocaleString()}건 언급</span>
        <span className="inline-flex items-center gap-1 font-medium text-success">
          <TrendingUp className="h-3.5 w-3.5" />+{trend}%
        </span>
      </div>
    </article>
  );
}
