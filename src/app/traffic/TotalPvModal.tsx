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

const TIME_DIMS = [
  { value: "daily",   label: "일간" },
  { value: "weekly",  label: "주간" },
  { value: "monthly", label: "월간" },
];

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

function formatRowDate(dateStr: string, timeDimension: string): string {
  const d = new Date(dateStr + "T00:00:00+09:00");
  if (timeDimension === "weekly") {
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    const ms = `${d.getMonth() + 1}/${d.getDate()}`;
    const me = `${end.getMonth() + 1}/${end.getDate()}`;
    return `${ms} ~ ${me}`;
  }
  if (timeDimension === "monthly") {
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  }
  const wd = WEEKDAY_KR[d.getDay()];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}.(${wd})`;
}

function fmtN(n: number): string {
  return n > 0 ? n.toLocaleString() : "—";
}

type Props = {
  initialHistory: DailyCvRow[];
};

export function TotalPvModal({ initialHistory }: Props) {
  const [open, setOpen] = useState(false);
  const [timeDim, setTimeDim] = useState("daily");
  const [section, setSection] = useState("all");
  const [history, setHistory] = useState<DailyCvRow[]>(initialHistory);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/traffic/daily-cv?section=${encodeURIComponent(section)}&time_dimension=${timeDim}`)
      .then((r) => r.json())
      .then(setHistory)
      .finally(() => setLoading(false));
  }, [open, section, timeDim]);

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
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold">조회수</h2>
                  {/* 일간/주간/월간 탭 */}
                  <div className="flex border border-gray-200 rounded-lg overflow-hidden h-7">
                    {TIME_DIMS.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => { setTimeDim(t.value); setSection("all"); }}
                        className={`px-3 text-xs font-medium transition-colors ${
                          timeDim === t.value
                            ? "bg-primary-500 text-white"
                            : "text-muted hover:bg-gray-50"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
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

              {/* 최신 요약 */}
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
                    <th className="sticky top-0 bg-gray-50 z-10 text-center px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                      {timeDim === "weekly" ? "주간" : timeDim === "monthly" ? "월" : "날짜"}
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 text-right px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide">전체</th>
                    <th className="sticky top-0 bg-gray-50 z-10 text-right px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide">PC</th>
                    <th className="sticky top-0 bg-gray-50 z-10 text-right px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide">모바일</th>
                    <th className="sticky top-0 bg-gray-50 z-10 px-4 py-2.5 border-b border-gray-100 w-28 text-[11px] font-medium text-gray-400 uppercase tracking-wide text-left">분포</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-sm text-gray-400">
                        데이터 없음
                      </td>
                    </tr>
                  ) : history.map((row, i) => (
                    <tr key={row.data_date} className={i === 0 ? "bg-green-50" : "hover:bg-gray-50"}>
                      <td className={`text-center px-4 py-3 border-b border-gray-50 text-xs font-medium ${i === 0 ? "text-green-600" : "text-gray-500"}`}>
                        {formatRowDate(row.data_date, timeDim)}
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
              {history.length > 0 && (
                <span>
                  {timeDim === "daily" ? `최근 ${history.length}일` : timeDim === "weekly" ? `최근 ${history.length}주` : `최근 ${history.length}개월`} 기준
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
