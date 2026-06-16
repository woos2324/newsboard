import { redirect } from "next/navigation";

export default function GapPage() {
  redirect("/issue?filter=missed");
}
