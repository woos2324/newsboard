"use client";

import { Info } from "lucide-react";

interface InfoTipProps {
  text: string;
}

export function InfoTip({ text }: InfoTipProps) {
  return (
    <span className="group relative inline-flex items-center">
      <Info className="h-3 w-3 cursor-help text-muted" />
      <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 w-56 -translate-x-1/2 rounded-lg border border-border bg-white px-3 py-2 text-xs leading-relaxed text-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}
