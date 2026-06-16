"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import type { CompareMediaOption } from "@/lib/queries";

const STORAGE_KEY = "compare:media";

export function MediaSelector({
  selected,
  options,
  explicit,
  title,
  description,
}: {
  selected: string[];
  options: CompareMediaOption[];
  /** URL 에 ?media= 가 명시됐는지 (false = 기본값으로 진입) */
  explicit: boolean;
  title: string;
  description?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // 낙관적 선택 상태 — 체크/칩을 서버 왕복 없이 즉시 반영.
  // 서버 데이터 조회(getCompareMatrix 등)는 transition 으로 백그라운드 처리.
  const [optimistic, setOptimistic] = useState<string[]>(selected);
  const [isPending, startTransition] = useTransition();

  // 서버가 새 selected 를 내려주면 로컬 상태 동기화
  useEffect(() => {
    setOptimistic(selected);
  }, [selected]);

  // URL 명시 선택을 localStorage 에 저장
  useEffect(() => {
    if (!explicit) return;
    try {
      localStorage.setItem(STORAGE_KEY, selected.join(","));
    } catch {
      /* localStorage 비활성 환경 무시 */
    }
  }, [explicit, selected]);

  // 파라미터 없이 진입 시 저장된 선택으로 복원 (최초 1회)
  useEffect(() => {
    if (explicit) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* 무시 */
    }
    if (!saved) return;
    const ids = ["segye", ...saved.split(",").filter((s) => s && s !== "segye")];
    // 현재 선택과 동일하면 redirect 불필요
    const same =
      ids.length === selected.length &&
      ids.every((id) => selected.includes(id));
    if (ids.length > 1 && !same) {
      router.replace(`/compare?media=${ids.join(",")}`);
    }
    // 의도적으로 최초 마운트 시 1회만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setOptimistic(ordered); // 즉시 반영
    startTransition(() => {
      router.push(`/compare?media=${ordered.join(",")}`);
    });
  }

  function remove(id: string) {
    if (id === "segye") return;
    navigate(optimistic.filter((s) => s !== id));
  }

  function toggle(id: string) {
    if (id === "segye") return;
    navigate(
      optimistic.includes(id)
        ? optimistic.filter((s) => s !== id)
        : [...optimistic, id]
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
    <div className="mb-5">
      {/* 헤더: 제목 우측에 매체 추가 버튼 (버튼 위치 고정 — 칩 증가와 무관) */}
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>

          {/* 매체 추가 드롭다운 */}
          <div className="relative shrink-0" ref={panelRef}>
            <button
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-primary-500 bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600"
            >
              <Plus className="h-4 w-4" />
              매체 추가
            </button>

            {open && (
              <div className="absolute left-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-white shadow-lg">
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
                    const isSelected = optimistic.includes(o.normalizedName);
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
        {description ? (
          <p className="mt-1 text-sm text-muted">{description}</p>
        ) : null}
      </div>

      {/* 선택된 매체 칩 */}
      <div
        className={`flex flex-wrap items-center gap-2 transition-opacity ${
          isPending ? "opacity-60" : ""
        }`}
      >
        {optimistic.map((id) => {
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
      </div>
    </div>
  );
}
