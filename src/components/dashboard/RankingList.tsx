"use client";

import { useMemo, useState } from "react";
import type { RankingNewsItem } from "@/lib/queries";

type Props = {
  items: RankingNewsItem[];
};

export function RankingList({ items }: Props) {
  const mediaOptions = useMemo(() => {
    const names = Array.from(new Set(items.map((i) => i.media))).sort();
    return ["전체", ...names];
  }, [items]);

  const [selected, setSelected] = useState("전체");

  const filtered = useMemo(() => {
    const base =
      selected === "전체" ? items : items.filter((i) => i.media === selected);
    return base.slice(0, 10);
  }, [items, selected]);

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="section-title">매체별 랭킹 뉴스</h2>
          <p className="caption mt-0.5">실시간 TOP 10 헤드라인</p>
        </div>
        <select
          aria-label="매체 선택"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-8 rounded-md border border-border bg-white px-2 text-xs focus:border-primary-500"
        >
          {mediaOptions.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>

      <ul className="divide-y divide-border">
        {filtered.length === 0 ? (
          <li className="caption py-4 text-center">데이터가 없습니다.</li>
        ) : (
          filtered.map((item, idx) => (
            <li
              key={`${item.media}-${item.rank}-${idx}`}
              className="flex items-center gap-3 py-2.5 text-sm"
            >
              <span className="w-5 text-center text-xs font-semibold text-muted">
                {selected === "전체" ? idx + 1 : item.rank}
              </span>
              <div className="min-w-0 flex-1">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate font-medium hover:text-primary-500"
                  >
                    {item.title}
                  </a>
                ) : (
                  <p className="truncate font-medium">{item.title}</p>
                )}
                <p className="caption">{item.media}</p>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
