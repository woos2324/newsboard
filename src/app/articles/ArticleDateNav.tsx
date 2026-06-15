"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  return kst.toISOString().slice(0, 10);
}

function formatDisplay(date: string): string {
  const d = new Date(date + "T00:00:00+09:00");
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const wd = WEEKDAY_KR[d.getDay()];
  return `${y}년 ${m}월 ${day}일 (${wd})`;
}

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type Props = { date: string; minDate?: string };

export function ArticleDateNav({ date, minDate: minDateProp }: Props) {
  const router = useRouter();
  const today = todayKST();
  // 실제 데이터가 있는 가장 오래된 날짜까지 선택 가능 (없으면 최근 7일 fallback)
  const minDate = minDateProp ?? addDays(today, -6);
  const inputRef = useRef<HTMLInputElement>(null);

  const canPrev = date > minDate;
  const canNext = date < today;

  function go(target: string) {
    router.push(`/articles?date=${target}&page=1`);
  }

  // 달력 선택 — 데이터 보유 범위 내에서만 이동
  function goDate(newDate: string) {
    if (!newDate || newDate > today || newDate < minDate) return;
    go(newDate);
  }

  function openCalendar() {
    try { inputRef.current?.showPicker(); } catch { inputRef.current?.click(); }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-4">
        <button
          onClick={() => canPrev && go(addDays(date, -1))}
          disabled={!canPrev}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-lg text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:text-muted/40"
        >
          ‹
        </button>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5">
            <p className="text-lg font-bold tracking-tight text-foreground">{formatDisplay(date)}</p>
            <button
              type="button"
              onClick={openCalendar}
              className="flex items-center text-blue-500 hover:text-blue-700"
              aria-label="날짜 선택"
            >
              <Calendar size={15} />
            </button>
          </div>
          {date === today && (
            <p className="text-[11px] text-muted">오늘 · {formatDisplay(minDate)}부터 탐색 가능</p>
          )}
          <input
            ref={inputRef}
            type="date"
            value={date}
            min={minDate}
            max={today}
            onChange={(e) => goDate(e.target.value)}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
        <button
          onClick={() => canNext && go(addDays(date, 1))}
          disabled={!canNext}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-lg text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:text-muted/40"
        >
          ›
        </button>
      </div>
    </div>
  );
}
