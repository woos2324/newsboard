"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import type { CompareMediaOption } from "@/lib/queries";

export function MediaSelector({
  selected,
  options,
}: {
  selected: string[];
  options: CompareMediaOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const labelOf = useMemo(() => {
    const map = new Map(options.map((o) => [o.normalizedName, o.name]));
    return (id: string) => map.get(id) ?? id;
  }, [options]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  function navigate(next: string[]) {
    const ordered = ["segye", ...next.filter((s) => s !== "segye")];
    router.push(`/compare?media=${ordered.join(",")}`);
  }

  function remove(id: string) {
    if (id === "segye") return;
    navigate(selected.filter((s) => s !== id));
  }

  function toggle(id: string) {
    if (id === "segye") return;
    navigate(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id]
    );
  }

  // 검색 필터 + 자사(segye) 제외 (자사는 항상 선택·고정)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((o) => o.normalizedName !== "segye")
      .filter(
        (o) =>
          !q ||
          o.name.toLowerCase().includes(q) ||
          o.normalizedName.toLowerCase().includes(q)
      );
  }, [options, query]);

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {/* 선택된 매체 칩 */}
      {selected.map((id) => {
        const isPinned = id === "segye";
        return (
          <span
            key={id}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium ${
              isPinned
                ? "border-primary-600 bg-primary-500 text-white"
                : "border-primary-500 bg-primary-500/10 text-primary-500"
            }`}
          >
            {labelOf(id)}
            {!isPinned && (
              <button
                onClick={() => remove(id)}
                className="rounded-full p-0.5 hover:bg-primary-500/20"
                aria-label={`${labelOf(id)} 제거`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        );
      })}

      {/* 매체 추가 드롭다운 */}
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-white px-3 py-1.5 text-sm font-medium text-muted hover:bg-background"
        >
          <Plus className="h-4 w-4" />
          매체 추가
        </button>

        {open && (
          <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-lg border border-border bg-white shadow-lg">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="h-4 w-4 text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="매체 검색..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>
            <ul className="max-h-72 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted">검색 결과 없음</li>
              ) : (
                filtered.map((o) => {
                  const isSelected = selected.includes(o.normalizedName);
                  return (
                    <li key={o.normalizedName}>
                      <button
                        onClick={() => toggle(o.normalizedName)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-background"
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={isSelected}
                          className="pointer-events-none h-4 w-4 accent-primary-500"
                        />
                        <span
                          className={
                            isSelected
                              ? "font-medium text-primary-500"
                              : "text-foreground"
                          }
                        >
                          {o.name}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
