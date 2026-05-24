"use client";

import { Bell, Calendar, ChevronDown, LogOut, Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/login/actions";
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

export function Topbar({
  profile,
  onMenuOpen,
}: {
  profile: CurrentProfile;
  onMenuOpen?: () => void;
}) {
  const [datetime, setDatetime] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDatetime(formatDateTime(new Date()));
    const timer = setInterval(() => setDatetime(formatDateTime(new Date())), 60000);
    return () => clearInterval(timer);
  }, []);

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
        <button
          type="button"
          aria-label="알림"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white hover:bg-background"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-error" />
        </button>

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

      {/* TODO: 검색 기능 미구현 — 향후 이슈/키워드/매체 검색 드롭다운 또는 /search 페이지로 구현 예정 */}
    </header>
  );
}
