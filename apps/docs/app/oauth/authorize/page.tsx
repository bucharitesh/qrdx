import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  authorizeParamEntries,
  checkAuthorizeRequest,
  readAuthorizeParams,
} from "@/lib/oauth-apps/authorize";
import { OAuthConsent, OAuthRequestError } from "./oauth-consent";
import { OAuthSignIn } from "./oauth-sign-in";

export const metadata: Metadata = {
  title: "Authorize app",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Sign-in and consent for /api/oauth/authorize. The request is re-checked
// here (and again when the form posts), so nothing is shown for an unknown
// app or an unregistered redirect_uri.
export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const params = readAuthorizeParams((key) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  });
  const check = await checkAuthorizeRequest(params);
  if (!check.ok) {
    return <OAuthRequestError description={check.description} />;
  }

  const entries = authorizeParamEntries(params);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    const callbackURL = `/oauth/authorize?${new URLSearchParams(entries)}`;
    return (
      <OAuthSignIn
        app={{ name: check.app.name, logoUrl: check.app.logoUrl }}
        callbackURL={callbackURL}
        scopes={check.scopes}
      />
    );
  }

  return (
    <OAuthConsent
      account={{
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? null,
      }}
      app={{
        name: check.app.name,
        description: check.app.description,
        logoUrl: check.app.logoUrl,
        websiteUrl: check.app.websiteUrl,
        trusted: check.app.trusted,
        builtBy: check.app.builtBy,
      }}
      fields={entries}
      redirectHost={new URL(params.redirectUri as string).host}
      scopes={check.scopes}
    />
  );
}
