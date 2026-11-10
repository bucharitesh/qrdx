import { isbot } from "isbot";
import { recordReferralClick } from "@/lib/affiliates/program";
import { parseReferralCode } from "@/lib/affiliates/rules";
import { AFFILIATE_REF_PARAM } from "@/lib/affiliates/terms";
import { isFeatureAvailable } from "@/lib/feature-availability";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

/**
 * An affiliate's referral link: /r/<code> → /?ref=<code>, where the code
 * rides along to sign-up (components/consent/referral-capture.tsx). It sets
 * no cookie and stores nothing about the visitor; an approved affiliate's
 * visit count goes up by one (not for bots or link previews). Unknown,
 * pending, rejected or suspended codes, and a server where the program is
 * off, go to the home page without a code.
 */
export async function GET(request: Request, { params }: Context) {
  const { code: raw } = await params;
  const code = parseReferralCode(raw);
  let valid = false;
  if (code && isFeatureAvailable("affiliates")) {
    const userAgent = request.headers.get("user-agent") ?? "";
    const prefetch =
      request.headers.get("purpose") === "prefetch" ||
      request.headers.get("sec-purpose")?.includes("prefetch") === true;
    valid = await recordReferralClick(code, {
      count: Boolean(userAgent) && !isbot(userAgent) && !prefetch,
    });
  }
  const location = valid
    ? `/?${AFFILIATE_REF_PARAM}=${encodeURIComponent(code as string)}`
    : "/";
  return new Response(null, {
    status: 307,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
