"use client";

import { useRouter } from "next/navigation";

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  return kst.toISOString().slice(0, 10);
}

const DEVICES = [
  { value: "all", label: "전체" },
  { value: "pc", label: "PC" },
  { value: "mobile", label: "모바일" },
];

type Props = {
  date: string;
  device: string;
};

export function DateDeviceSelector({ date, device }: Props) {
  const router = useRouter();
  const today = todayKST();

  function goTo(newDate: string, newDevice: string) {
    if (!newDate) return;
    router.push(`/traffic?date=${newDate}&device=${newDevice}`);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={date}
        max={today}
        onChange={(e) => goTo(e.target.value, device)}
        className="h-[34px] px-3 border border-border rounded-lg text-sm bg-white text-foreground focus:outline-none focus:border-primary"
      />
      <div className="flex border border-border rounded-lg overflow-hidden h-[34px]">
        {DEVICES.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => goTo(date, opt.value)}
            className={`px-3 text-sm transition-colors ${
              device === opt.value
                ? "bg-primary text-white"
                : "text-muted hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
