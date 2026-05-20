"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { DailyCvRow } from "@/lib/queries";

type Props = {
  history: DailyCvRow[];
};

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+09:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const wd = WEEKDAY_KR[d.getDay()];
  return `${d.getFullYear()}.${String(m).padStart(2, "0")}.${String(day).padStart(2, "0")}.(${wd})`;
}

function fmtN(n: number): string {
  return n.toLocaleString();
}

export function TotalPvModal({ history }: Props) {
  const [open, setOpen] = useState(false);

  const today = history[0];
  const maxTotal = Math.max(...history.map((r) => r.total), 1);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-blue-700 hover:text-blue-900 underline underline-offset-2"
      >
        더보기
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-[720px] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            {/* Head */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">일별 조회수</h2>
                  <div className="text-xs text-gray-400 mt-0.5">
                    최근 {history.length}일 · 전체 / PC / 모바일
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-lg border border-gray-200 grid place-items-center text-gray-400 hover:bg-gray-50 shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
              {/* 오늘 요약 */}
              {today && (
                <div className="flex gap-4 mt-3 px-3.5 py-2.5 bg-gray-50 rounded-lg text-xs">
                  <div className="flex-1">
                    <strong className="block text-base font-bold text-green-600">{fmtN(today.total)}</strong>
                    <span className="text-gray-400">전체</span>
                  </div>
                  <div className="flex-1">
                    <strong className="block text-base font-bold text-gray-700">{fmtN(today.pc)}</strong>
                    <span className="text-gray-400">PC</span>
                  </div>
                  <div className="flex-1">
                    <strong className="block text-base font-bold text-gray-700">{fmtN(today.mobile)}</strong>
                    <span className="text-gray-400">모바일</span>
                  </div>
                </div>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky top-0 bg-gray-50 z-10 text-center px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                      날짜
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 text-right px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                      전체
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 text-right px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                      PC
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 text-right px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                      모바일
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 px-4 py-2.5 border-b border-gray-100 w-28">
                      분포
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row, i) => (
                    <tr
                      key={row.data_date}
                      className={i === 0 ? "bg-green-50" : "hover:bg-gray-50"}
                    >
                      <td className={`text-center px-4 py-3 border-b border-gray-50 text-xs font-medium ${i === 0 ? "text-green-600" : "text-gray-500"}`}>
                        {formatDateLabel(row.data_date)}
                      </td>
                      <td className={`text-right px-4 py-3 border-b border-gray-50 tabular-nums font-semibold ${i === 0 ? "text-green-600" : "text-gray-700"}`}>
                        {fmtN(row.total)}
                      </td>
                      <td className="text-right px-4 py-3 border-b border-gray-50 tabular-nums text-gray-500">
                        {fmtN(row.pc)}
                      </td>
                      <td className="text-right px-4 py-3 border-b border-gray-50 tabular-nums text-gray-500">
                        {fmtN(row.mobile)}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-50">
                        <div className="h-[5px] bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${maxTotal ? (row.total / maxTotal) * 100 : 0}%`,
                              background: i === 0
                                ? "linear-gradient(90deg, #86efac, #16a34a)"
                                : "linear-gradient(90deg, #bfdbfe, #1e40af)",
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">
              최근 <strong className="text-gray-700">{history.length}일</strong> 기준
            </div>
          </div>
        </div>
      )}
    </>
  );
}
