"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

const DEVICES = [
  { value: "all", label: "전체" },
  { value: "pc", label: "PC" },
  { value: "mobile", label: "모바일" },
];

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  return kst.toISOString().slice(0, 10);
}

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatLabel(date: string): string {
  const d = new Date(date + "T00:00:00+09:00");
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const wd = WEEKDAY_KR[d.getDay()];
  return `${y}.${m}.${day} (${wd})`;
}

type Props = {
  date: string;
  device: string;
};

export function DateDeviceSelector({ date, device }: Props) {
  const router = useRouter();
  const today = todayKST();
  const inputRef = useRef<HTMLInputElement>(null);

  const canNext = date < today;

  function goDate(newDate: string) {
    if (!newDate || newDate > today) return;
    router.push(`/traffic?date=${newDate}&device=${device}`);
  }

  function goDevice(newDevice: string) {
    router.push(`/traffic?date=${date}&device=${newDevice}`);
  }

  function openCalendar() {
    try {
      inputRef.current?.showPicker();
    } catch {
      inputRef.current?.click();
    }
  }

  return (
    <div className="flex items-center justify-between w-full gap-4">
      {/* 날짜 네비게이터 */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => goDate(addDays(date, -1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 text-xl leading-none"
          aria-label="이전 날"
        >
          ‹
        </button>

        <div className="flex items-center gap-1.5 px-2">
          <span className="text-lg font-bold tracking-tight text-foreground">
            {formatLabel(date)}
          </span>
          <button
            type="button"
            onClick={openCalendar}
            className="text-blue-500 hover:text-blue-700 flex items-center"
            aria-label="날짜 선택"
          >
            <Calendar size={15} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => canNext && goDate(addDays(date, 1))}
          disabled={!canNext}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-xl leading-none"
          aria-label="다음 날"
        >
          ›
        </button>

        {/* 숨김 date input — 달력 팝업용 */}
        <input
          ref={inputRef}
          type="date"
          value={date}
          max={today}
          onChange={(e) => goDate(e.target.value)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      {/* 디바이스 토글 */}
      <div className="flex border border-border rounded-lg overflow-hidden h-[30px] shrink-0">
        {DEVICES.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => goDevice(opt.value)}
            className={`px-3 text-xs transition-colors ${
              device === opt.value
                ? "bg-primary-500 text-white"
                : "text-muted hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
