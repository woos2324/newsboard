import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { AppShellClient } from "@/components/AppShellClient";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return <AppShellClient profile={profile}>{children}</AppShellClient>;
}
