"use client";

import { Info } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

interface InfoTipProps {
  text: string;
}

const GAP = 6;
const MARGIN = 8;

export function InfoTip({ text }: InfoTipProps) {
  const [anchor, setAnchor] = useState<{ left: number; top: number; bottom: number } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  const handleEnter = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos(null);
    setAnchor({ left: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
  };

  const handleLeave = () => {
    setAnchor(null);
    setPos(null);
  };

  // 실제 렌더된 툴팁 크기를 측정한 뒤에야 화면 경계를 알 수 있어 2단계로 위치를 잡는다:
  // 1) anchor만 있는 첫 렌더는 숨김 상태로 그려 크기 측정 → 2) pos 계산 후 표시.
  useLayoutEffect(() => {
    if (!anchor || !tipRef.current) return;
    const w = tipRef.current.offsetWidth;
    const h = tipRef.current.offsetHeight;

    let left = anchor.left - w / 2;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - w - MARGIN));

    // 아이콘 아래는 표 다음 행 등 다른 콘텐츠와 겹치기 쉬워 기본은 위쪽에 띄우고,
    // 화면 위쪽에 붙어 공간이 없을 때만 아래로 내린다.
    const showAbove = anchor.top - h - GAP >= MARGIN;
    const top = showAbove ? anchor.top - h - GAP : anchor.bottom + GAP;

    setPos({ left, top });
  }, [anchor]);

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <Info className="h-3 w-3 cursor-help text-muted" />
      {anchor && (
        <span
          ref={tipRef}
          style={{
            position: "fixed",
            left: pos ? pos.left : anchor.left,
            top: pos ? pos.top : anchor.bottom + GAP,
            visibility: pos ? "visible" : "hidden",
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
