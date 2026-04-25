type Point = { day: string; value: number };

type Props = {
  data: Point[];
  total: string;
  delta: number;
};

export function SubscriberChart({ data, total, delta }: Props) {
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const range = Math.max(max - min, 1);
  const positive = delta >= 0;

  const w = 320;
  const h = 80;
  const stepX = w / (data.length - 1);

  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = h - ((d.value - min) / range) * h;
    return { x, y, ...d };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const areaD = `${pathD} L${w},${h} L0,${h} Z`;

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">구독자 변화</h2>
          <p className="caption mt-0.5">최근 7일</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold tracking-tight">{total}</p>
          <p
            className={`text-xs font-medium ${
              positive ? "text-success" : "text-error"
            }`}
          >
            {positive ? "+" : ""}
            {delta}%
          </p>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="mt-4 w-full"
        preserveAspectRatio="none"
        aria-label="구독자 7일 변화 추이"
      >
        <defs>
          <linearGradient id="subGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1E40AF" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#1E40AF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#subGradient)" />
        <path
          d={pathD}
          fill="none"
          stroke="#1E40AF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p) => (
          <circle key={p.day} cx={p.x} cy={p.y} r="2.5" fill="#1E40AF" />
        ))}
      </svg>

      <div className="mt-2 flex justify-between text-[10px] text-muted">
        {data.map((d) => (
          <span key={d.day}>{d.day}</span>
        ))}
      </div>
    </div>
  );
}
