"use client";

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import type { CurrentProfile } from "@/lib/auth";

export function AppShellClient({
  profile,
  children,
}: {
  profile: CurrentProfile;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar profile={profile} isOpen={open} onClose={() => setOpen(false)} />
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar profile={profile} onMenuOpen={() => setOpen(true)} />
        {children}
      </div>
    </div>
  );
}
