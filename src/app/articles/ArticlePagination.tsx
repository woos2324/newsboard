"use client";

const GROUP = 5;

type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function ArticlePagination({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  const currentGroup = Math.ceil(page / GROUP);
  const totalGroups = Math.ceil(totalPages / GROUP);
  const groupStart = (currentGroup - 1) * GROUP + 1;
  const groupEnd = Math.min(groupStart + GROUP - 1, totalPages);
  const pages = Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i);

  const hasPrevGroup = currentGroup > 1;
  const hasNextGroup = currentGroup < totalGroups;

  const btnBase =
    "flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition-colors";
  const btnDefault = "border-border bg-white text-foreground hover:bg-background";
  const btnActive = "border-primary-500 bg-primary-500 font-semibold text-white";
  const btnDisabled = "border-border bg-white cursor-not-allowed text-muted/40";

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => hasPrevGroup && onPageChange(groupStart - GROUP)}
        disabled={!hasPrevGroup}
        className={`${btnBase} ${hasPrevGroup ? btnDefault : btnDisabled}`}
      >
        ‹
      </button>

      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`${btnBase} ${p === page ? btnActive : btnDefault}`}
        >
          {p}
        </button>
      ))}

      <button
        onClick={() => hasNextGroup && onPageChange(groupEnd + 1)}
        disabled={!hasNextGroup}
        className={`${btnBase} ${hasNextGroup ? btnDefault : btnDisabled}`}
      >
        ›
      </button>
    </div>
  );
}
