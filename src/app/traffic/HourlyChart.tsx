"use client";

import { useState, useEffect } from "react";
import type { HourlyPvItem, RealtimeTickItem } from "@/lib/queries";

type Props = {
  hourlyToday: HourlyPvItem[];
  hourlyYesterday: HourlyPvItem[];
  date: string; // YYYY-MM-DD
  isRealtime?: boolean;
  realtimeTicks?: RealtimeTickItem[];
  capturedLabel?: string;
};

// captured_at(ISO, +09:00) → KST 하루 중 시각(0~24 실수). 브라우저 TZ 무관.
function kstHourFrac(iso: string): number {
  const d = new Date(iso);
  return ((d.getUTCHours() + 9) % 24) + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
}

const CL = 44;   // chart left
const CR = 710;  // chart right
const CT = 20;   // chart top
const CB = 244;  // chart bottom
const CH = CB - CT; // 224
const CW = CR - CL; // 666
const SLOT_W = CW / 24; // 27.75
const BAR_W = 16;
const BAR_OFF = (SLOT_W - BAR_W) / 2; // 5.875

function bx(h: number) { return CL + h * SLOT_W + BAR_OFF; }
function bcx(h: number) { return bx(h) + BAR_W / 2; }
function byPos(pv: number, maxPv: number) { return CB - (pv / maxPv) * CH; }
function bHeight(pv: number, maxPv: number) { return (pv / maxPv) * CH; }

function fmtShort(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "만";
  if (n >= 1000) return (n / 1000).toFixed(0) + "천";
  return n.toString();
}

// 로케일 비의존 천단위 콤마 (toLocaleString 은 서버/클라 ICU 차이로 hydration mismatch 유발)
function fmtNum(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const ZONES = [
  { start: 6, end: 9, color: "#fef3c7", label: "출근 (6~9시)" },
  { start: 11, end: 13, color: "#dcfce7", label: "점심 (11~13시)" },
  { start: 17, end: 19, color: "#f3e8ff", label: "퇴근 (17~19시)" },
];

export function HourlyChart(props: Props) {
  const { hourlyToday, hourlyYesterday, date, isRealtime, realtimeTicks, capturedLabel } = props;

  // ── 실시간(오늘) 모드: 네이버가 오늘 시간대별 PV를 안 주므로,
  //    우리가 10분마다 저장한 누적 PV(tick)로 '오늘 경과 시간대 누적 추이'를 그린다.
  if (isRealtime && realtimeTicks && realtimeTicks.length > 0) {
    return (
      <RealtimeHourlyChart
        ticks={realtimeTicks}
        hourlyYesterday={hourlyYesterday}
        date={date}
        capturedLabel={capturedLabel ?? ""}
      />
    );
  }

  // Fill missing hours with 0
  const today24 = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    pv: hourlyToday.find((x) => x.hour === h)?.pv ?? 0,
  }));
  const yest24 = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    pv: hourlyYesterday.find((x) => x.hour === h)?.pv ?? 0,
  }));

  const maxPv = Math.max(...today24.map((x) => x.pv), ...yest24.map((x) => x.pv), 1);
  const avgPv = today24.reduce((s, x) => s + x.pv, 0) / 24;
  const avgY = byPos(avgPv, maxPv);

  const peak = today24.reduce(
    (best, h) => (h.pv > best.pv ? h : best),
    { hour: 0, pv: 0 }
  );

  const todayTotal = today24.reduce((s, x) => s + x.pv, 0);
  const yestTotal = yest24.reduce((s, x) => s + x.pv, 0);
  const totalDeltaPct = yestTotal ? ((todayTotal - yestTotal) / yestTotal) * 100 : 0;

  // Prev date label
  const prevDate = new Date(date + "T00:00:00+09:00");
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = `${prevDate.getMonth() + 1}/${prevDate.getDate()}`;
  const todayD = new Date(date + "T00:00:00+09:00");
  const todayDateStr = `${todayD.getMonth() + 1}/${todayD.getDate()}`;

  // Y grid labels at 0, 1/3, 2/3, max
  const yLevels = [0, 1 / 3, 2 / 3, 1];

  // Yesterday polyline points
  const yestPoints = yest24
    .map((x) => `${bcx(x.hour).toFixed(1)},${byPos(x.pv, maxPv).toFixed(1)}`)
    .join(" ");

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 mb-3.5">
        <div>
          <h3 className="text-sm font-semibold">시간대별 조회수</h3>
          <div className="text-xs text-gray-400 mt-0.5">0시~23시 KST · 오늘(막대) vs 어제(점선) 비교</div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 pb-3 text-[11px] text-gray-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-2 rounded-sm inline-block" style={{ background: "#1e40af" }} />오늘(피크)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-2 rounded-sm inline-block" style={{ background: "#93c5fd" }} />오늘(일반)
        </span>
        <span className="inline-flex items-center gap-1.5" style={{ color: "#6b7280" }}>
          <span className="w-3.5 inline-block border-t-2 border-dashed" style={{ borderColor: "#9ca3af" }} />어제 {prevDateStr}
        </span>
        <span className="inline-flex items-center gap-1.5" style={{ color: "#1e40af" }}>
          <span className="w-3.5 inline-block border-t-2 border-dashed" style={{ borderColor: "#1e40af" }} />오늘 평균 {fmtShort(avgPv)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-2 rounded-sm inline-block" style={{ background: "#fef3c7" }} />출근
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-2 rounded-sm inline-block" style={{ background: "#dcfce7" }} />점심
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-2 rounded-sm inline-block" style={{ background: "#f3e8ff" }} />퇴근
        </span>
      </div>

      {/* SVG Chart */}
      <div className="w-full">
        <svg
          viewBox="0 0 720 280"
          className="w-full h-auto block overflow-visible"
          preserveAspectRatio="none"
          aria-label="시간대별 조회수 차트"
        >
          {/* Zone backgrounds */}
          {ZONES.map((z) => {
            const zx = CL + z.start * SLOT_W;
            const zw = (z.end - z.start + 1) * SLOT_W;
            const mid = zx + zw / 2;
            return (
              <g key={z.start}>
                <rect x={zx} y={CT} width={zw} height={CH} fill={z.color} opacity="0.45" />
                <text x={mid} y={CT + 14} textAnchor="middle" fontSize="10" fill="#6b7280" fontWeight="500">
                  {z.label}
                </text>
              </g>
            );
          })}

          {/* Grid lines */}
          {yLevels.map((frac, i) => {
            const y = CB - frac * CH;
            return <line key={i} x1={CL} y1={y} x2={CR} y2={y} stroke="#e5e7eb" strokeDasharray="2 3" strokeWidth="1" />;
          })}

          {/* Y axis labels */}
          {yLevels.map((frac, i) => {
            const y = CB - frac * CH;
            const val = Math.round(frac * maxPv);
            return (
              <text key={i} x={CL - 4} y={y + 4} textAnchor="end" fontSize="10" fill="#6b7280">
                {fmtShort(val)}
              </text>
            );
          })}

          {/* Today bars */}
          {today24.map(({ hour, pv }) => {
            const isPeak = hour === peak.hour && pv > 0;
            const h = bHeight(pv, maxPv);
            const yp = yest24[hour]?.pv ?? 0;
            return (
              <rect
                key={hour}
                x={bx(hour)}
                y={CB - h}
                width={BAR_W}
                height={Math.max(h, 0)}
                rx="2"
                fill={isPeak ? "#1e40af" : "#93c5fd"}
                style={{ cursor: "default", transition: "fill 150ms" }}
              >
                <title>
                  {hour}시 · {fmtNum(pv)} PV{isPeak ? " (피크)" : ""}
                  {yp ? ` · 어제 ${fmtNum(yp)}` : ""}
                </title>
              </rect>
            );
          })}

          {/* Yesterday line */}
          <polyline points={yestPoints} fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="3 2" />
          {yest24
            .filter((x) => x.pv > 0)
            .map((x) => (
              <circle key={x.hour} cx={bcx(x.hour)} cy={byPos(x.pv, maxPv)} r="2" fill="#9ca3af" />
            ))}

          {/* Average line */}
          {avgPv > 0 && (
            <>
              <line x1={CL} y1={avgY} x2={CR} y2={avgY} stroke="#1e40af" strokeWidth="1.5" strokeDasharray="5 3" />
              <text x={CR - 4} y={avgY - 4} textAnchor="end" fontSize="10" fill="#1e40af" fontWeight="600">
                평균 {fmtShort(avgPv)}
              </text>
            </>
          )}

          {/* X axis labels (3h interval + 23) */}
          {[0, 3, 6, 9, 12, 15, 18, 21, 23].map((h) => (
            <text key={h} x={bcx(h)} y={CB + 18} textAnchor="middle" fontSize="10" fill="#6b7280">
              {h}
            </text>
          ))}
          <text x={(CL + CR) / 2} y={CB + 30} textAnchor="middle" fontSize="10" fill="#9ca3af">
            시(KST)
          </text>
        </svg>
      </div>

      {/* Compare summary */}
      <div className="mt-3.5 px-3 py-2.5 bg-gray-50 rounded-lg flex items-center gap-3 text-xs">
        <strong className="font-semibold">어제 동시간 대비</strong>
        <span className={`font-bold ${totalDeltaPct >= 0 ? "text-red-600" : "text-blue-600"}`}>
          {totalDeltaPct >= 0 ? "▲" : "▼"} {Math.abs(totalDeltaPct).toFixed(1)}%
        </span>
      </div>

      {/* Hourly comparison table */}
      <div className="mt-4" data-section="hourly-table">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-sm font-semibold">시간대별 PV 상세</div>
          <div className="text-xs text-gray-400">단위: PV · 어제 대비 증감(Δ)</div>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="text-center pb-2.5 border-b border-gray-100 text-[12px] font-medium text-gray-400 uppercase tracking-wide">시간</th>
              <th className="text-right pb-2.5 border-b border-gray-100 text-[12px] font-medium text-gray-400 uppercase tracking-wide">{todayDateStr}</th>
              <th className="text-right pb-2.5 border-b border-gray-100 text-[12px] font-medium text-gray-400 uppercase tracking-wide">{prevDateStr}</th>
              <th className="text-right pb-2.5 border-b border-gray-100 text-[12px] font-medium text-gray-400 uppercase tracking-wide">Δ</th>
            </tr>
          </thead>
          <tbody>
            {today24.map(({ hour, pv }) => {
              const yPv = yest24[hour]?.pv ?? 0;
              const dPct = yPv ? ((pv - yPv) / yPv) * 100 : 0;
              const isPeak = hour === peak.hour && pv > 0;
              return (
                <tr key={hour} className={isPeak ? "bg-blue-50" : "hover:bg-gray-50"}>
                  <td
                    className={`text-center py-2.5 border-b border-gray-50 tabular-nums text-sm ${
                      isPeak ? "font-bold text-blue-700" : "text-gray-400 font-medium"
                    }`}
                  >
                    {String(hour).padStart(2, "0")}
                    {isPeak ? " ★" : ""}
                  </td>
                  <td
                    className={`text-right py-2.5 border-b border-gray-50 tabular-nums font-semibold text-sm ${
                      isPeak ? "text-blue-700" : "text-gray-700"
                    }`}
                  >
                    {pv ? fmtNum(pv) : "—"}
                  </td>
                  <td className="text-right py-2.5 border-b border-gray-50 tabular-nums text-gray-500 text-sm">
                    {yPv ? fmtNum(yPv) : "—"}
                  </td>
                  <td
                    className={`text-right py-2.5 border-b border-gray-50 tabular-nums text-xs font-semibold ${
                      dPct > 0 ? "text-red-600" : dPct < 0 ? "text-blue-600" : "text-gray-400"
                    }`}
                  >
                    {yPv > 0 && pv > 0
                      ? dPct > 0
                        ? `▲ ${dPct.toFixed(1)}%`
                        : dPct < 0
                        ? `▼ ${Math.abs(dPct).toFixed(1)}%`
                        : "─"
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 실시간 시간대별 PV 차트 (오늘 전용)
// 누적 tick 을 시간 경계마다 차분(diff)하여 시간대별 PV 막대를 만든다. 어제 동시간 PV와 비교.
function RealtimeHourlyChart({
  ticks,
  hourlyYesterday,
  date,
  capturedLabel,
}: {
  ticks: RealtimeTickItem[];
  hourlyYesterday: HourlyPvItem[];
  date: string;
  capturedLabel: string;
}) {
  // 실시간 차트는 "지금" 데이터 → SSR HTML 과 클라 스냅샷이 어긋날 여지가 있어
  // 마운트 후 클라이언트에서만 렌더(하이드레이션 불일치 원천 차단).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="card">
        <h3 className="text-sm font-semibold">시간대별 조회수 <span className="text-red-600">(실시간)</span></h3>
        <div className="text-xs text-gray-400 mt-0.5">{capturedLabel}</div>
        <div className="mt-3 h-[260px] rounded-lg bg-gray-50 animate-pulse" />
      </div>
    );
  }

  const sorted = ticks
    .map((t) => ({ hf: kstHourFrac(t.captured_at), pv: t.pv }))
    .sort((a, b) => a.hf - b.hf);

  // 시간 경계 차분 → 시간대별 PV(관측 구간만). 첫 tick의 누적값은 관측 이전 누적이라 시간 분해 불가.
  const hourPv: Record<number, number> = {};
  const observed = new Set<number>();
  for (let i = 1; i < sorted.length; i++) {
    const h = Math.floor(sorted[i].hf);
    const d = sorted[i].pv - sorted[i - 1].pv;
    hourPv[h] = (hourPv[h] ?? 0) + Math.max(0, d);
    observed.add(h);
  }
  const curHour = sorted.length ? Math.floor(sorted[sorted.length - 1].hf) : -1;
  const firstObsHour = sorted.length ? Math.floor(sorted[0].hf) : 0;
  const baselineCum = sorted[0]?.pv ?? 0; // 관측 시작 시점 누적(이전 시간대 합산)

  const yPv = Array.from({ length: 24 }, (_, h) => hourlyYesterday.find((x) => x.hour === h)?.pv ?? 0);

  const today24 = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    pv: hourPv[h] ?? 0,
    observed: observed.has(h),
  }));

  const maxPv = Math.max(...today24.filter((x) => x.observed).map((x) => x.pv), ...yPv, 1);

  const yestPoints = yPv
    .map((pv, h) => `${bcx(h).toFixed(1)},${byPos(pv, maxPv).toFixed(1)}`)
    .join(" ");

  const yLevels = [0, 1 / 3, 2 / 3, 1];
  const todayD = new Date(date + "T00:00:00+09:00");
  const todayDateStr = `${todayD.getMonth() + 1}/${todayD.getDate()}`;
  const prevD = new Date(date + "T00:00:00+09:00");
  prevD.setDate(prevD.getDate() - 1);
  const prevDateStr = `${prevD.getMonth() + 1}/${prevD.getDate()}`;

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 mb-3.5">
        <div>
          <h3 className="text-sm font-semibold">시간대별 조회수 <span className="text-red-600">(실시간)</span></h3>
          <div className="text-xs text-gray-400 mt-0.5">
            우리 관측({ticks.length}회) 차분 · {capturedLabel} · 관측 시작 {String(firstObsHour).padStart(2,"0")}시 이후만 표시
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pb-3 text-[11px] text-gray-400">
        <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-2 rounded-sm inline-block" style={{ background: "#1e40af" }} />오늘 진행 중</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-2 rounded-sm inline-block" style={{ background: "#93c5fd" }} />오늘 관측</span>
        <span className="inline-flex items-center gap-1.5" style={{ color: "#6b7280" }}><span className="w-3.5 inline-block border-t-2 border-dashed" style={{ borderColor: "#9ca3af" }} />어제 {prevDateStr}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-2 rounded-sm inline-block" style={{ background: "#fef3c7" }} />출근</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-2 rounded-sm inline-block" style={{ background: "#dcfce7" }} />점심</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-2 rounded-sm inline-block" style={{ background: "#f3e8ff" }} />퇴근</span>
      </div>

      <div className="w-full">
        <svg viewBox="0 0 720 280" className="w-full h-auto block overflow-visible" preserveAspectRatio="none" aria-label="시간대별 조회수 (실시간)">
          {ZONES.map((z) => {
            const zx = CL + z.start * SLOT_W;
            const zw = (z.end - z.start + 1) * SLOT_W;
            const mid = zx + zw / 2;
            return (
              <g key={z.start}>
                <rect x={zx} y={CT} width={zw} height={CH} fill={z.color} opacity="0.45" />
                <text x={mid} y={CT + 14} textAnchor="middle" fontSize="10" fill="#6b7280" fontWeight="500">{z.label}</text>
              </g>
            );
          })}

          {yLevels.map((frac, i) => {
            const y = CB - frac * CH;
            return (
              <g key={i}>
                <line x1={CL} y1={y} x2={CR} y2={y} stroke="#e5e7eb" strokeDasharray="2 3" strokeWidth="1" />
                <text x={CL - 4} y={y + 4} textAnchor="end" fontSize="10" fill="#6b7280">{fmtShort(Math.round(frac * maxPv))}</text>
              </g>
            );
          })}

          {/* 오늘 시간대 막대 (관측 구간만) */}
          {today24.filter((x) => x.observed).map(({ hour, pv }) => {
            const isCur = hour === curHour;
            const h = bHeight(pv, maxPv);
            return (
              <rect key={hour} x={bx(hour)} y={CB - h} width={BAR_W} height={Math.max(h, 0)} rx="2"
                fill={isCur ? "#1e40af" : "#93c5fd"}>
                <title>{hour}시 · {fmtNum(pv)} PV{isCur ? " (진행 중)" : ""} · 어제 {fmtNum(yPv[hour] ?? 0)}</title>
              </rect>
            );
          })}

          {/* 어제 시간대 라인 */}
          <polyline points={yestPoints} fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="3 2" />
          {yPv.map((pv, h) => pv > 0 ? <circle key={h} cx={bcx(h)} cy={byPos(pv, maxPv)} r="2" fill="#9ca3af" /> : null)}

          {/* '진행 중' 라벨 */}
          {curHour >= 0 && observed.has(curHour) && (
            <text x={bcx(curHour)} y={byPos(hourPv[curHour] ?? 0, maxPv) - 8} textAnchor="middle" fontSize="10" fill="#1e40af" fontWeight="700">진행 중</text>
          )}

          {[0, 3, 6, 9, 12, 15, 18, 21, 23].map((h) => (
            <text key={h} x={bcx(h)} y={CB + 18} textAnchor="middle" fontSize="10" fill="#6b7280">{h}</text>
          ))}
          <text x={(CL + CR) / 2} y={CB + 30} textAnchor="middle" fontSize="10" fill="#9ca3af">시(KST)</text>
        </svg>
      </div>

      <div className="mt-3.5 px-3 py-2.5 bg-gray-50 rounded-lg text-xs text-gray-500 leading-relaxed">
        관측 시작({String(firstObsHour).padStart(2,"0")}시) 시점 누적 <strong className="text-gray-700">{fmtNum(baselineCum)} PV</strong> 는 이전 시간대 합산이라 시간대 분해 불가.
        그 이후는 10분마다 관측한 누적의 차이로 시간대별 PV를 계산합니다. (내일부터는 0시부터 관측되어 전 시간대 표시)
      </div>

      {/* 시간대별 상세 (관측 구간 vs 어제) */}
      {today24.some((x) => x.observed) && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-sm font-semibold">시간대별 PV 상세 (관측 구간)</div>
            <div className="text-xs text-gray-400">{todayDateStr} vs {prevDateStr}</div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-center pb-2.5 border-b border-gray-100 text-[12px] font-medium text-gray-400 uppercase tracking-wide">시간</th>
                <th className="text-right pb-2.5 border-b border-gray-100 text-[12px] font-medium text-gray-400 uppercase tracking-wide">{todayDateStr}</th>
                <th className="text-right pb-2.5 border-b border-gray-100 text-[12px] font-medium text-gray-400 uppercase tracking-wide">{prevDateStr}</th>
                <th className="text-right pb-2.5 border-b border-gray-100 text-[12px] font-medium text-gray-400 uppercase tracking-wide">Δ</th>
              </tr>
            </thead>
            <tbody>
              {today24.filter((x) => x.observed).map(({ hour, pv }) => {
                const yPvH = yPv[hour] ?? 0;
                const dPct = yPvH ? ((pv - yPvH) / yPvH) * 100 : 0;
                const isCur = hour === curHour;
                return (
                  <tr key={hour} className={isCur ? "bg-blue-50" : "hover:bg-gray-50"}>
                    <td className={`text-center py-2.5 border-b border-gray-50 tabular-nums text-sm ${isCur ? "font-bold text-blue-700" : "text-gray-400 font-medium"}`}>
                      {String(hour).padStart(2, "0")}{isCur ? " ●" : ""}
                    </td>
                    <td className={`text-right py-2.5 border-b border-gray-50 tabular-nums font-semibold text-sm ${isCur ? "text-blue-700" : "text-gray-700"}`}>{fmtNum(pv)}</td>
                    <td className="text-right py-2.5 border-b border-gray-50 tabular-nums text-gray-500 text-sm">{yPvH ? fmtNum(yPvH) : "—"}</td>
                    <td className={`text-right py-2.5 border-b border-gray-50 tabular-nums text-xs font-semibold ${dPct > 0 ? "text-red-600" : dPct < 0 ? "text-blue-600" : "text-gray-400"}`}>
                      {yPvH > 0 ? (dPct > 0 ? `▲ ${dPct.toFixed(1)}%` : dPct < 0 ? `▼ ${Math.abs(dPct).toFixed(1)}%` : "─") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2 text-[11px] text-gray-400">
            ※ 진행 중(●) 시간대는 해당 시간 전체가 아닌 현재까지의 부분 누적이라 어제 종일값보다 낮게 보일 수 있습니다.
          </div>
        </div>
      )}
    </div>
  );
}
