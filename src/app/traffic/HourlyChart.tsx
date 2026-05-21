import type { HourlyPvItem } from "@/lib/queries";

type Props = {
  hourlyToday: HourlyPvItem[];
  hourlyYesterday: HourlyPvItem[];
  date: string; // YYYY-MM-DD
};

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

const ZONES = [
  { start: 6, end: 9, color: "#fef3c7", label: "출근 (6~9시)" },
  { start: 11, end: 13, color: "#dcfce7", label: "점심 (11~13시)" },
  { start: 17, end: 19, color: "#f3e8ff", label: "퇴근 (17~19시)" },
];

export function HourlyChart({ hourlyToday, hourlyYesterday, date }: Props) {
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
                  {hour}시 · {pv.toLocaleString()} PV{isPeak ? " (피크)" : ""}
                  {yp ? ` · 어제 ${yp.toLocaleString()}` : ""}
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
      <div className="mt-4">
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
                    {pv ? pv.toLocaleString() : "—"}
                  </td>
                  <td className="text-right py-2.5 border-b border-gray-50 tabular-nums text-gray-500 text-sm">
                    {yPv ? yPv.toLocaleString() : "—"}
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
