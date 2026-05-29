"use client";

import { Info } from "lucide-react";
import { useState, useRef } from "react";

interface InfoTipProps {
  text: string;
}

export function InfoTip({ text }: InfoTipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const handleEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ x: rect.left + rect.width / 2, y: rect.bottom + 6 });
    }
  };

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setPos(null)}
    >
      <Info className="h-3 w-3 cursor-help text-muted" />
      {pos && (
        <span
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y,
            transform: "translateX(-50%)",
            zIndex: 9999,
          }}
          className="pointer-events-none w-56 rounded-lg border border-border bg-white px-3 py-2 text-left text-xs leading-relaxed text-foreground shadow-md"
        >
          {text}
        </span>
      )}
    </span>
  );
}
