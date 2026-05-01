"use client";

import { useRouter } from "next/navigation";

type Props = { date: string; page: number; totalPages: number };

export function ArticlePagination({ date, page, totalPages }: Props) {
  const router = useRouter();

  if (totalPages <= 1) return null;

  function go(p: number) {
    router.push(`/articles?date=${date}&page=${p}`);
  }

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => page > 1 && go(page - 1)}
        disabled={page === 1}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-sm text-foreground hover:bg-background disabled:cursor-not-allowed disabled:text-muted/40"
      >
        ‹
      </button>
      {pages.map((p) => (
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
