"use client";

import { Sparkles, Loader2, CheckCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type Props = {
  kind: "daily" | "issue";
  clusterId?: number;
  label?: string;
};

export function GenerateReportButton({ kind, clusterId, label }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleClick = async () => {
    setError(null);
    setSuccess(false);
    setLoading(true);
    try {
      if (kind === "daily") {
        await api.generateDailyReport();
      } else if (kind === "issue" && clusterId != null) {
        await api.generateIssueSummary(clusterId);
      }
      setSuccess(true);
      startTransition(() => router.refresh());
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "요약 생성 실패";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const busy = loading || isPending;
  const buttonLabel =
    label ?? (kind === "daily" ? "오늘의 브리핑 생성" : "이 이슈 요약 생성");

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : success ? (
          <CheckCircle className="h-3.5 w-3.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {busy ? "생성 중…" : success ? "생성 완료!" : buttonLabel}
      </button>
      {error && (
        <p className="max-w-xs text-right text-[11px] text-error">{error}</p>
      )}
    </div>
  );
}
