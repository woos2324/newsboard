import { AlertTriangle } from "lucide-react";
import Link from "next/link";

type Alert = {
  title: string;
  competitors: string[];
  priority: "high" | "medium" | "low";
  gapMinutes: number;
};

type Props = {
  items: Alert[];
};

const priorityLabel = {
  high: "긴급",
  medium: "주의",
  low: "참고",
} as const;

const priorityStyle = {
  high: "badge-error",
  medium: "badge-warning",
  low: "badge-muted",
} as const;

export function MissedAlerts({ items }: Props) {
  return (
    <div className="card card-alert">
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-error" />
        <h2 className="section-title">낙종 알림</h2>
        <span className="ml-auto text-[11px] font-medium text-error">
          {items.length}건 감지
        </span>
      </div>

      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.title}
            className="rounded-lg border border-border bg-white p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-snug">{item.title}</p>
              <span className={`badge ${priorityStyle[item.priority]}`}>
                {priorityLabel[item.priority]}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
              <span>{item.competitors.join(", ")} 선보도</span>
              <span>·</span>
              <span>{item.gapMinutes}분 지연</span>
            </div>
          </li>
        ))}
      </ul>

      <Link
        href="/gap"
        className="mt-3 block w-full rounded-lg border border-border bg-white py-2 text-center text-xs font-medium text-primary-500 hover:bg-primary-500/5"
      >
        전체 낙종 이슈 보기 →
      </Link>
    </div>
  );
}
