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
          // white-space는 상속 속성이라 position:fixed로 화면에 붙여도 DOM상 부모인
          // th.whitespace-nowrap(테이블 헤더) 등의 nowrap이 그대로 내려와 줄바꿈이 막혀
          // 텍스트가 박스 밖으로 삐져나갔다. whitespace-normal로 명시해 상속을 끊는다.
          className="pointer-events-none w-56 whitespace-normal rounded-lg border border-border bg-white px-3 py-2 text-left text-xs leading-relaxed text-foreground shadow-md"
        >
          {text}
        </span>
      )}
    </span>
  );
}
