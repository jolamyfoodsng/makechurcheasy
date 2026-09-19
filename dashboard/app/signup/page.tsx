import { redirect } from "next/navigation";

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const referral =
    typeof params?.ref === "string"
      ? params.ref
      : typeof params?.referral === "string"
        ? params.referral
        : typeof params?.referralCode === "string"
          ? params.referralCode
          : "";
  const target = new URLSearchParams({ mode: "signup" });
  if (referral) target.set("ref", referral);

  redirect(`/login?${target.toString()}`);
}
