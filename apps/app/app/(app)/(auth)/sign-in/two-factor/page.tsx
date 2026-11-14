import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readSignInParams } from "../_lib/params";
import { hasPendingChallenge } from "../_lib/two-factor-challenge";
import { TwoFactorPage } from "./two-factor-page";

export const metadata: Metadata = {
  title: "Two-step verification",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The second step of a sign-in that ended in a redirect (Google, GitHub,
 * workspace SSO) for someone with two-step verification on. The challenge
 * plugin (packages/auth/sign-in-challenge.ts) sends the browser here with
 * `next`, checked by lib/safe-redirect like /sign-in's.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next } = readSignInParams(await searchParams);

  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect(next);

  return <TwoFactorPage next={next} pending={await hasPendingChallenge()} />;
}
