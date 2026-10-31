import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { baseUrl, createMetadata } from "@/lib/metadata";
import { turnstileSiteKey } from "@/lib/safety/turnstile";
import { isWebRiskConfigured } from "@/lib/safety/web-risk";
import { isValidSlug, SHORT_LINK_BASE } from "@/lib/short-links";
import { ReportForm } from "./report-form";

export const metadata: Metadata = createMetadata({
  title: "Report a QR code",
  description:
    "Report a QRdx QR code that leads to phishing, malware, scams or other harmful content. We review every report and switch off codes that break our terms.",
  path: "/report-abuse",
});

const OWN_LINK = /^\/(?:q|p)\/([0-9A-Za-z]{7})\/?$/;
const OWN_ORIGINS = new Set([new URL(SHORT_LINK_BASE).origin, baseUrl.origin]);

/** Prefill from ?slug= / ?url=, or from the QRdx page the visitor came from. */
function defaultTarget(
  params: Record<string, string | string[] | undefined>,
  referer: string | null,
): string {
  const slug = typeof params.slug === "string" ? params.slug : null;
  if (slug && isValidSlug(slug)) return `${SHORT_LINK_BASE}/q/${slug}`;
  const url = typeof params.url === "string" ? params.url.slice(0, 2048) : "";
  if (url) return url;
  if (!referer) return "";
  try {
    const from = new URL(referer);
    const match = OWN_LINK.exec(from.pathname);
    return OWN_ORIGINS.has(from.origin) && match?.[1] && isValidSlug(match[1])
      ? `${SHORT_LINK_BASE}/q/${match[1]}`
      : "";
  } catch {
    return "";
  }
}

export default async function ReportAbusePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, requestHeaders] = await Promise.all([searchParams, headers()]);
  const defaultUrl = defaultTarget(params, requestHeaders.get("referer"));

  return (
    <div className="container mx-auto grid gap-10 px-6 py-12 md:px-10 md:py-20 lg:max-w-6xl lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">
            Report a QR code
          </h1>
          <p className="text-muted-foreground">
            If a QR code made with QRdx leads to phishing, malware, a scam or
            other harmful content, tell us here. You don't need an account, and
            your report stays anonymous unless you leave your email.
          </p>
        </div>
        <ReportForm
          defaultUrl={defaultUrl}
          turnstileSiteKey={turnstileSiteKey()}
        />
      </div>

      <aside className="space-y-6 text-sm">
        <section className="space-y-2">
          <h2 className="text-base font-semibold">What happens next</h2>
          <ul className="text-muted-foreground list-disc space-y-1.5 pl-5">
            <li>We review reports within 24–48 hours.</li>
            <li>
              Codes that break our terms are switched off for everyone who scans
              them.
            </li>
            {isWebRiskConfigured() && (
              <li>
                Links that Google Web Risk lists as malware or phishing are
                switched off as soon as they're reported.
              </li>
            )}
            <li>If you leave your email, we tell you what we did.</li>
          </ul>
        </section>
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Stay safe</h2>
          <p className="text-muted-foreground">
            Don't enter passwords, card numbers or one-time codes on a page you
            reached from a QR code you don't trust. If you already did, change
            the password and contact your bank.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Other ways to reach us</h2>
          <p className="text-muted-foreground">
            Email{" "}
            <a
              className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
              href="mailto:support@qrdx.dev"
            >
              support@qrdx.dev
            </a>{" "}
            for copyright (DMCA) notices or anything the form doesn't cover.
            Read the{" "}
            <Link
              className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
              href="/legal/report-abuse"
            >
              abuse policy
            </Link>{" "}
            for what we don't allow.
          </p>
        </section>
      </aside>
    </div>
  );
}
