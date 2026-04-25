import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Props = {
  label: string;
  value: string;
  delta: number;
  deltaLabel?: string;
  icon: LucideIcon;
};

export function StatCard({ label, value, delta, deltaLabel, icon: Icon }: Props) {
  const positive = delta >= 0;
  return (
    <div className="card card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-medium text-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500/10 text-primary-500">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs">
        <span
          className={`inline-flex items-center gap-0.5 font-medium ${
            positive ? "text-success" : "text-error"
          }`}
        >
          {positive ? (
            <ArrowUpRight className="h-3.5 w-3.5" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5" />
          )}
          {positive ? "+" : ""}
          {delta}%
        </span>
        <span className="text-muted">{deltaLabel ?? "전일 대비"}</span>
      </div>
    </div>
  );
}
