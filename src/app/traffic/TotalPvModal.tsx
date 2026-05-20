"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { DailyCvRow } from "@/lib/queries";

const SECTIONS = [
  { value: "all", label: "전체" },
  { value: "정치", label: "정치" },
  { value: "경제", label: "경제" },
  { value: "사회", label: "사회" },
  { value: "IT", label: "IT" },
  { value: "생활", label: "생활" },
  { value: "세계", label: "세계" },
  { value: "엔터", label: "엔터" },
  { value: "스포츠", label: "스포츠" },
  { value: "기타", label: "기타" },
];

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+09:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const wd = WEEKDAY_KR[d.getDay()];
  return `${d.getFullYear()}.${String(m).padStart(2, "0")}.${String(day).padStart(2, "0")}.(${wd})`;
}

function fmtN(n: number): string {
  return n > 0 ? n.toLocaleString() : "—";
}

type Props = {
  initialHistory: DailyCvRow[];
};

export function TotalPvModal({ initialHistory }: Props) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("all");
  const [history, setHistory] = useState<DailyCvRow[]>(initialHistory);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/traffic/daily-cv?section=${encodeURIComponent(section)}&days=30`)
      .then((r) => r.json())
      .then(setHistory)
      .finally(() => setLoading(false));
  }, [open, section]);

  const today = history[0];
  const maxTotal = Math.max(...history.map((r) => r.total), 1);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-blue-700 hover:text-blue-900 whitespace-nowrap"
      >
        더보기 →
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
                    <strong className={`block text-base font-bold ${today.total > 0 ? "text-green-600" : "text-gray-400"}`}>
                      {today.total > 0 ? today.total.toLocaleString() : "—"}
                    </strong>
                    <span className="text-gray-400">전체</span>
                  </div>
                  <div className="flex-1">
                    <strong className="block text-base font-bold text-gray-700">
                      {today.pc > 0 ? today.pc.toLocaleString() : "—"}
                    </strong>
                    <span className="text-gray-400">PC</span>
                  </div>
                  <div className="flex-1">
                    <strong className="block text-base font-bold text-gray-700">
                      {today.mobile > 0 ? today.mobile.toLocaleString() : "—"}
                    </strong>
                    <span className="text-gray-400">모바일</span>
                  </div>
                </div>
              )}

              {/* 섹션 탭 */}
              <div className="flex gap-1 mt-3 flex-wrap">
                {SECTIONS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSection(s.value)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      section === s.value
                        ? "bg-primary-500 text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className={`flex-1 overflow-y-auto px-4 transition-opacity ${loading ? "opacity-40" : ""}`}>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky top-0 bg-gray-50 z-10 text-center px-6 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                      날짜
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 text-right px-6 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                      전체
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 text-right px-6 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                      PC
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 text-right px-6 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                      모바일
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 px-6 py-2.5 border-b border-gray-100 w-32 text-[11px] font-medium text-gray-400 uppercase tracking-wide text-left">
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
                      <td className={`text-center px-6 py-3 border-b border-gray-50 text-xs font-medium ${i === 0 ? "text-green-600" : "text-gray-500"}`}>
                        {formatDateLabel(row.data_date)}
                      </td>
                      <td className={`text-right px-6 py-3 border-b border-gray-50 tabular-nums font-semibold ${i === 0 ? "text-green-600" : "text-gray-700"}`}>
                        {fmtN(row.total)}
                      </td>
                      <td className="text-right px-6 py-3 border-b border-gray-50 tabular-nums text-gray-500">
                        {fmtN(row.pc)}
                      </td>
                      <td className="text-right px-6 py-3 border-b border-gray-50 tabular-nums text-gray-500">
                        {fmtN(row.mobile)}
                      </td>
                      <td className="px-6 py-3 border-b border-gray-50">
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
