"use client";

import { useState, useMemo } from "react";
import { X, Download } from "lucide-react";
import type { SearchKeywordItem } from "@/lib/queries";

type Props = {
  keywords: SearchKeywordItem[];
  date: string;
};

function downloadCsv(items: SearchKeywordItem[], date: string) {
  const header = ["순위", "키워드", "클릭수", "비중(%)"];
  const rows = items.map((k) => [k.rank, k.keyword, k.clicks, k.ratio.toFixed(2)]);
  const csv = "﻿" + [header, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url;
  el.download = `traffic_keywords_${date}.csv`;
  el.click();
  URL.revokeObjectURL(url);
}

export function KeywordListModal({ keywords, date }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const maxClicks = keywords[0]?.clicks ?? 1;

  const dateLabel = new Date(date + "T00:00:00+09:00").toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? keywords.filter((k) => k.keyword.toLowerCase().includes(q)) : keywords;
  }, [keywords, query]);

  function handleClose() {
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-blue-700 hover:text-blue-900 whitespace-nowrap shrink-0"
      >
        전체 {keywords.length}건 보기 →
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-6"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-[760px] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            {/* Head */}
            <div className="px-4 pt-5 pb-4 border-b border-gray-100 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">검색 키워드 전체 {keywords.length}건</h2>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {dateLabel} · 네이버 통합검색 기준
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-8 h-8 rounded-lg border border-gray-200 grid place-items-center text-gray-400 hover:bg-gray-50 hover:text-gray-700 shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Controls */}
            <div className="px-4 py-3 border-b border-gray-100 flex gap-2 items-center sm:px-6">
              <input
                type="search"
                placeholder="키워드 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 h-[34px] px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => downloadCsv(filtered, date)}
                className="h-[34px] px-3 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
              >
                <Download size={13} />
                CSV
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">검색 결과 없음</div>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky top-0 bg-gray-50 z-10 whitespace-nowrap text-center px-3 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide w-12 sm:px-4">순위</th>
                      <th className="sticky top-0 bg-gray-50 z-10 whitespace-nowrap text-left px-3 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide sm:px-4">키워드</th>
                      <th className="sticky top-0 bg-gray-50 z-10 px-4 py-2.5 border-b border-gray-100 w-32 hidden sm:table-cell">분포</th>
                      <th className="sticky top-0 bg-gray-50 z-10 whitespace-nowrap text-right px-3 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide w-16 sm:px-4 sm:w-20">클릭</th>
                      <th className="sticky top-0 bg-gray-50 z-10 whitespace-nowrap text-right px-3 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide w-14 sm:px-4 sm:w-16">비중</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((kw) => (
                      <tr key={kw.rank} className="hover:bg-gray-50">
                        <td className="text-center px-3 py-3 border-b border-gray-50 text-gray-400 tabular-nums text-xs sm:px-4">
                          {kw.rank}
                        </td>
                        <td className="px-3 py-3 border-b border-gray-50 font-medium sm:px-4">{kw.keyword}</td>
                        <td className="px-4 py-3 border-b border-gray-50 hidden sm:table-cell">
                          <div className="h-[5px] bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-700 rounded-full"
                              style={{ width: `${maxClicks ? (kw.clicks / maxClicks) * 100 : 0}%` }} />
                          </div>
                        </td>
                        <td className="text-right px-3 py-3 border-b border-gray-50 tabular-nums font-semibold sm:px-4">
                          {kw.clicks.toLocaleString()}
                        </td>
                        <td className="text-right px-3 py-3 border-b border-gray-50 tabular-nums text-gray-400 sm:px-4">
                          {kw.ratio.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 sm:px-6">
              {filtered.length !== keywords.length
                ? `검색 결과 ${filtered.length}건`
                : `총 ${keywords.length}건`}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
