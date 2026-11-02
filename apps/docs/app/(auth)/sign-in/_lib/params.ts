import { safeNextPath } from "@/lib/safe-redirect";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** The query /sign-in acts on, after the `next` safety check. */
export interface SignInPageParams {
  /** Same-site path to open after sign-in (/dashboard when missing or unsafe). */
  next: string;
  /** Arrived from /sign-out: say so. */
  signedOut: boolean;
}

export function readSignInParams(params: SearchParams): SignInPageParams {
  return {
    next: safeNextPath(first(params.next)),
    signedOut: first(params.signedOut) === "1",
  };
}
