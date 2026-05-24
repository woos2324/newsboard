import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type Props = {
  label: string;
  sublabel?: string;
  value: string;
  delta: number;
  deltaLabel?: string;
  icon: LucideIcon;
  href?: string;
};

export function StatCard({ label, sublabel, value, delta, deltaLabel, icon: Icon, href }: Props) {
  const positive = delta >= 0;
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-medium text-muted">
            {label}
            {sublabel && (
              <span className="ml-1 text-[10px] font-normal text-muted/70">({sublabel})</span>
            )}
          </p>
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
    </>
  );

  if (href) {
    return (
      <Link href={href} className="card card-hover block cursor-pointer">
        {inner}
      </Link>
    );
  }
  return <div className="card">{inner}</div>;
}
