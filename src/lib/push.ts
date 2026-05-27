import webpush from "web-push";
import { getSupabase } from "./supabase";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function notifySuperadmins(payload: {
  title: string;
  body: string;
  url?: string;
}) {
  const admin = getSupabase();

  const { data: superadmins } = await admin
    .from("profiles")
    .select("user_id")
    .eq("role", "superadmin");

  if (!superadmins?.length) return;

  const { data: subs } = await admin
    .from("push_subscription")
    .select("endpoint, p256dh, auth")
    .in(
      "user_id",
      superadmins.map((p) => p.user_id)
    );

  if (!subs?.length) return;

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { urgency: "high" }
      )
    )
  );

  // 만료된 구독(410/404) 자동 삭제
  const staleEndpoints = subs
    .filter((_, i) => {
      const r = results[i];
      if (r.status !== "rejected") return false;
      const status = (r.reason as { statusCode?: number })?.statusCode;
      return status === 410 || status === 404;
    })
    .map((s) => s.endpoint);

  if (staleEndpoints.length > 0) {
    await admin.from("push_subscription").delete().in("endpoint", staleEndpoints);
  }
}
