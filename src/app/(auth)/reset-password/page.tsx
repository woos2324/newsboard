import ResetPasswordClient from "./ResetPasswordClient";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await searchParams;
  return <ResetPasswordClient initialStep={step === "3" ? 3 : 1} />;
}
