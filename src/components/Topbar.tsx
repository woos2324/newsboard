"use client";

import { Bell, Calendar, ChevronDown, LogOut, Menu } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/(auth)/login/actions";
import type { CurrentProfile } from "@/lib/auth";
import type { Role } from "@/lib/roles";

const ROLE_LABEL: Record<Role, string> = {
  superadmin: "최고관리자",
  admin: "관리자",
  business: "사업부",
  reporter: "기자",
};

function formatDateTime(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}월 ${day}일 (${weekday}) ${hours}:${minutes}`;
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}


type PushState = "unsupported" | "denied" | "subscribed" | "unsubscribed";

export function Topbar({
  profile,
  onMenuOpen,
}: {
  profile: CurrentProfile;
  onMenuOpen?: () => void;
}) {
  const [datetime, setDatetime] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pushState, setPushState] = useState<PushState>("unsupported");
  const menuRef = useRef<HTMLDivElement>(null);
  const isSuperadmin = profile.role === "superadmin";

  useEffect(() => {
    setDatetime(formatDateTime(new Date()));
    const timer = setInterval(() => setDatetime(formatDateTime(new Date())), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isSuperadmin || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setPushState("subscribed");
      } else if (Notification.permission === "denied") {
        setPushState("denied");
      } else {
        setPushState("unsubscribed");
      }
    });
  }, [isSuperadmin]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  const handleBellClick = useCallback(async () => {
    if (!isSuperadmin || pushState === "unsupported" || pushState === "denied") return;

    if (pushState === "subscribed") {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushState("unsubscribed");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setPushState("denied");
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    });

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });

    setPushState("subscribed");
  }, [isSuperadmin, pushState]);

  const bellDotColor =
    pushState === "subscribed"
      ? "bg-green-500"
      : pushState === "denied"
      ? "bg-gray-400"
      : "bg-error";

  const bellTitle =
    pushState === "subscribed"
      ? "가입 알림 구독 중 (클릭하여 해제)"
      : pushState === "denied"
      ? "브라우저 알림이 차단됐습니다. 브라우저 설정에서 허용해주세요."
      : pushState === "unsubscribed"
      ? "클릭하여 가입 알림 받기"
      : undefined;

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-white/80 px-6 backdrop-blur">
      <button
        type="button"
        onClick={onMenuOpen}
        aria-label="메뉴 열기"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white hover:bg-background lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 text-sm text-muted">
        <Calendar className="h-4 w-4" />
        <span>{datetime ?? ""}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {isSuperadmin && pushState !== "unsupported" && (
          <button
            type="button"
            aria-label={bellTitle}
            title={bellTitle}
            onClick={handleBellClick}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white hover:bg-background"
          >
            <Bell className="h-4 w-4" />
            <span className={`absolute right-2 top-2 h-1.5 w-1.5 rounded-full ${bellDotColor}`} />
          </button>
        )}

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-9 items-center gap-2 rounded-lg border border-border bg-white pl-1.5 pr-2.5 hover:bg-background"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500/10 text-[11px] font-semibold text-primary-500">
              {initials(profile.name)}
            </span>
            <span className="text-sm font-medium">{profile.name}</span>
            <span className="text-[11px] text-muted">
              {ROLE_LABEL[profile.role as Role]}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-lg border border-border bg-white shadow-md">
              <div className="border-b border-border px-3 py-2.5">
                <p className="truncate text-sm font-medium">{profile.name}</p>
                <p className="truncate text-xs text-muted">{profile.email}</p>
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-background"
                >
                  <LogOut className="h-4 w-4" />
                  로그아웃
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
