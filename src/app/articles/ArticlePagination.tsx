"use client";

import { useRouter } from "next/navigation";

type Props = { date: string; page: number; totalPages: number };

function getVisiblePages(page: number, totalPages: number): number[] {
  const half = 2;
  let start = Math.max(1, page - half);
  const end = Math.min(totalPages, start + 4);
  start = Math.max(1, end - 4);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function ArticlePagination({ date, page, totalPages }: Props) {
  const router = useRouter();

  if (totalPages <= 1) return null;

  function go(p: number) {
    router.push(`/articles?date=${date}&page=${p}`);
  }

  const visiblePages = getVisiblePages(page, totalPages);
  const showFirst = visiblePages[0] > 1;
  const showLast = visiblePages[visiblePages.length - 1] < totalPages;

  return (
    <div className="flex items-center gap-1">
      {/* 이전 */}
      <button
        onClick={() => page > 1 && go(page - 1)}
        disabled={page === 1}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-sm text-foreground hover:bg-background disabled:cursor-not-allowed disabled:text-muted/40"
      >
        ‹
      </button>

      {/* 첫 페이지 + 말줄임 */}
      {showFirst && (
        <>
          <button
            onClick={() => go(1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-sm text-foreground hover:bg-background"
          >
            1
          </button>
          {visiblePages[0] > 2 && (
            <span className="flex h-8 w-6 items-center justify-center text-xs text-muted">…</span>
          )}
        </>
      )}

      {/* 슬라이딩 윈도우 */}
      {visiblePages.map((p) => (
        <button
          key={p}
          onClick={() => go(p)}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition-colors ${
            p === page
              ? "border-primary-500 bg-primary-500 font-semibold text-white"
              : "border-border bg-white text-foreground hover:bg-background"
          }`}
        >
          {p}
        </button>
      ))}

      {/* 말줄임 + 마지막 페이지 */}
      {showLast && (
        <>
          {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
            <span className="flex h-8 w-6 items-center justify-center text-xs text-muted">…</span>
          )}
          <button
            onClick={() => go(totalPages)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-sm text-foreground hover:bg-background"
          >
            {totalPages}
          </button>
        </>
      )}

      {/* 다음 */}
      <button
        onClick={() => page < totalPages && go(page + 1)}
        disabled={page === totalPages}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-sm text-foreground hover:bg-background disabled:cursor-not-allowed disabled:text-muted/40"
      >
        ›
      </button>
    </div>
  );
}
