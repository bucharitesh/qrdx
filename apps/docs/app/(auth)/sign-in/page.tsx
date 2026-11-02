import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-redirect";
import { SignInPrompt } from "./sign-in-prompt";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Where signed-out visitors to signed-in pages land (proxy.ts and the page
 * guards send them here as /sign-in?next=<path>). Opens the sign-in dialog,
 * which returns them to `next`; signed-in visitors go straight there.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next: raw } = await searchParams;
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw);

  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect(next);

  return <SignInPrompt next={next} />;
}
