"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";

export async function markReviewing(alertId: number): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("missed_issue_alert")
    .update({ alert_status: "reviewing" })
    .eq("missed_issue_alert_id", alertId)
    .eq("alert_status", "open");
  if (error) throw error;
  revalidatePath("/gap");
}

export async function markResolved(alertId: number): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("missed_issue_alert")
    .update({ alert_status: "resolved" })
    .eq("missed_issue_alert_id", alertId);
  if (error) throw error;
  revalidatePath("/gap");
}
