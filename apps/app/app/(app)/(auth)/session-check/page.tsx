import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CONFIRM_RETURN_PARAM } from "@/lib/account/confirmation";
import { currentSession } from "@/lib/account/confirmation-server";
import {
  SESSION_CHECK_MESSAGES,
  sessionCheckNext,
} from "@/lib/account/session-origin";
import { signInPath } from "@/lib/safe-redirect";
import { SessionCheck } from "./session-check";

export const metadata: Metadata = {
  title: SESSION_CHECK_MESSAGES.title,
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/**
 * Where proxy.ts sends a held session's browser from the signed-in app
 * (lib/account/session-origin.ts): "Confirm it's you" over a blank page, then
 * back to `next`. A session that isn't held goes straight on, except on the
 * way back from signing in again (`?confirm=`), which the dialog's provider
 * finishes first.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = sessionCheckNext(first(params.next));
  const returning = first(params[CONFIRM_RETURN_PARAM]) !== undefined;

  const session = await currentSession();
  if (!session) redirect(signInPath(next));
  if (!(session.held || returning)) redirect(next);

  return (
    <SessionCheck
      // Back from signing in again: once the provider has finished it, the
      // page loads without `?confirm=` and the check starts afresh.
      key={returning ? "returning" : "check"}
      next={next}
      returning={returning}
    />
  );
}
