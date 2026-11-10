import "server-only";

import { Callout } from "fumadocs-ui/components/callout";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  getNpmLag,
  type NpmLag,
  type PublishedPackage,
} from "@/lib/npm-version";
import { playgroundHref } from "@/lib/playground-links";

// Styled here too: the changelog renders the notice outside docs prose.
const LINK = "font-medium text-foreground underline underline-offset-4";

/** What `npm install` gets today, and how to use the new features meanwhile. */
const DETAILS: Record<PublishedPackage, (lag: NpmLag) => ReactNode> = {
  qrdx: ({ published }) => (
    <>
      <code>npm install qrdx</code> still installs {published}. Its basic{" "}
      <code>QRCode</code> works, but most patterns, frames, Art QR, EPS export
      and the scan score came later, and {published} lists React 19, sharp and
      jspdf as its own dependencies. Until the release is out, use every option
      in the{" "}
      <Link className={LINK} href={playgroundHref()}>
        playground
      </Link>
      , or render images from a URL with the{" "}
      <Link className={LINK} href="/docs/developers/image-api">
        Image API
      </Link>
      .
    </>
  ),
  "@qrdx/cli": ({ published }) => (
    <>
      <code>npx @qrdx/cli</code> still runs {published}, which has no{" "}
      <code>qrdx batch</code>. Until the release is out, make a CSV of codes
      with the{" "}
      <Link className={LINK} href="/tools/bulk">
        bulk generator
      </Link>{" "}
      in your browser, or one code at a time with <code>qrdx generate</code> or
      the{" "}
      <Link className={LINK} href="/docs/developers/image-api">
        Image API
      </Link>
      .
    </>
  ),
};

/** The notice for packages whose new version npm doesn't have yet. */
export function NpmLagNotice({ lags }: { lags: NpmLag[] }) {
  if (lags.length === 0) return null;
  const title = lags
    .map(({ name, upcoming }) => `${name} ${upcoming}`)
    .join(" and ");
  return (
    <Callout
      type="info"
      title={`${title} ${lags.length > 1 ? "aren't" : "isn't"} on npm yet`}
    >
      <div className="space-y-2">
        {lags.map((lag) => (
          <p key={lag.name}>{DETAILS[lag.name](lag)}</p>
        ))}
      </div>
    </Callout>
  );
}

/**
 * Says so when npm is behind the version these docs describe (the repo's
 * package.json, or `version`). The registry answer is cached for an hour, so
 * the notice goes away by itself after a release; when npm can't be reached
 * it renders nothing.
 */
export async function NpmStatus({
  package: name,
  version,
}: {
  package: PublishedPackage;
  version?: string;
}) {
  const lag = await getNpmLag(name, version);
  return lag ? <NpmLagNotice lags={[lag]} /> : null;
}
