"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { SearchKeywordItem } from "@/lib/queries";

type Props = {
  keywords: SearchKeywordItem[];
  date: string;
};

export function KeywordListModal({ keywords, date }: Props) {
  const [open, setOpen] = useState(false);
  const maxClicks = keywords[0]?.clicks ?? 1;

  const dateLabel = new Date(date + "T00:00:00+09:00").toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

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
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-[760px] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            {/* Head */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">검색 키워드 전체 {keywords.length}건</h2>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {dateLabel} · 네이버 통합검색 기준
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-lg border border-gray-200 grid place-items-center text-gray-400 hover:bg-gray-50 hover:text-gray-700 shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky top-0 bg-gray-50 z-10 text-center px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide w-12">
                      순위
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 text-left px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                      키워드
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 px-4 py-2.5 border-b border-gray-100 w-32">
                      분포
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 text-right px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide w-20">
                      클릭
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 text-right px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide w-16">
                      비중
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.map((kw) => (
                    <tr key={kw.rank} className="hover:bg-gray-50">
                      <td className="text-center px-4 py-3 border-b border-gray-50 text-gray-400 tabular-nums text-xs">
                        {kw.rank}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-50 font-medium">{kw.keyword}</td>
                      <td className="px-4 py-3 border-b border-gray-50">
                        <div className="h-[5px] bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-700 rounded-full"
                            style={{
                              width: `${maxClicks ? (kw.clicks / maxClicks) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </td>
                      <td className="text-right px-4 py-3 border-b border-gray-50 tabular-nums font-semibold">
                        {kw.clicks.toLocaleString()}
                      </td>
                      <td className="text-right px-4 py-3 border-b border-gray-50 tabular-nums text-gray-400">
                        {kw.ratio.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">
              총 <strong className="text-gray-700">{keywords.length}건</strong>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
