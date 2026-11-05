import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readSignInParams } from "./_lib/params";
import { SignInPage } from "./sign-in-page";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The sign-in page: the same panel as the dialog, on a page of its own. It's
 * where proxy.ts and page guards send signed-out visitors (/sign-in?next=…),
 * where /sign-out lands (?signedOut=1), and the fallback when the dialog
 * can't open. Signed-in visitors go straight to `next`.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next, signedOut, ssoError } = readSignInParams(await searchParams);

  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect(next);

  return <SignInPage next={next} signedOut={signedOut} ssoError={ssoError} />;
}
