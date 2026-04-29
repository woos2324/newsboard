"use client";

import { Bell, Calendar } from "lucide-react";

export function Topbar() {
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-white/80 px-6 backdrop-blur">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Calendar className="h-4 w-4" />
        <span>{today}</span>
      </div>

      {/* TODO: 검색 기능 미구현 — 향후 이슈/키워드/매체 검색 드롭다운 또는 /search 페이지로 구현 예정
      <div className="relative ml-auto w-full max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          placeholder="이슈, 키워드, 매체 검색…"
          aria-label="검색"
          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted focus:border-primary-500 focus:bg-white"
        />
      </div>
      */}

      <button
        type="button"
        aria-label="알림"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white hover:bg-background"
      >
        <Bell className="h-4 w-4" />
        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-error" />
      </button>
    </header>
  );
}
