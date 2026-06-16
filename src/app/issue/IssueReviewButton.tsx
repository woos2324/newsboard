"use client";

import { useTransition } from "react";
import { markReviewing, markResolved } from "./actions";

export function IssueReviewButton({
  alertId,
  status,
}: {
  alertId: number;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();

  if (status === "reviewing") {
    return (
      <div className="flex shrink-0 gap-2">
        <span className="rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-1.5 text-xs font-medium text-primary-500">
          검토 중
        </span>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => markResolved(alertId))}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-background disabled:opacity-50"
        >
          {isPending ? "처리 중..." : "완료"}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => markReviewing(alertId))}
      className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-background disabled:opacity-50"
    >
      {isPending ? "처리 중..." : "검토 시작"}
    </button>
  );
}
