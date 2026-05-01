"use client";

import { useRouter } from "next/navigation";

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

type Props = { date: string };

export function ArticleDateNav({ date }: Props) {
  const router = useRouter();
  const today = todayKST();
  const minDate = addDays(today, -6);

  const canPrev = date > minDate;
  const canNext = date < today;

  function go(target: string) {
    router.push(`/articles?date=${target}&page=1`);
  }

  return (
    <div className="flex flex-col items-center gap-2 pt-4">
      <div className="flex items-center gap-4">
        <button
          onClick={() => canPrev && go(addDays(date, -1))}
          disabled={!canPrev}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-lg text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:text-muted/40"
        >
          ‹
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold">{formatDisplay(date)}</p>
          {date === today && <p className="text-[11px] text-muted">오늘 · 최근 7일 탐색 가능</p>}
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
