"use client";

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import { ExportSquare, InfoCircle } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";
import { OAuthAppLogo } from "@/components/oauth/oauth-app-logo";
import { QrdxLogo } from "@/components/qrdx-logo";
import { OAUTH_SCOPE_INFO, type OAuthScope } from "@/lib/oauth-scopes";

export function AuthorizeShell({ children }: { children: ReactNode }) {
  return (
    <main className="bg-background flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

export function OAuthRequestError({ description }: { description: string }) {
  return (
    <AuthorizeShell>
      <div className="space-y-2 text-center">
        <h1 className="text-lg font-semibold">This link can't be used</h1>
        <p className="text-muted-foreground text-sm">
          The app that sent you here made an invalid request:{" "}
          <span className="text-foreground">{description}</span>. Go back to the
          app and try again, or contact its developer.
        </p>
      </div>
    </AuthorizeShell>
  );
}

export function ScopeList({
  appName,
  scopes,
}: {
  appName: string;
  scopes: readonly OAuthScope[];
}) {
  return (
    <section aria-label="Requested permissions" className="space-y-2.5">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {appName} will be able to
      </p>
      <ul className="divide-y rounded-lg border">
        {scopes.map((scope) => (
          <li className="space-y-0.5 px-3 py-2.5" key={scope}>
            <p className="text-sm font-medium">
              {OAUTH_SCOPE_INFO[scope].label}
            </p>
            <p className="text-muted-foreground text-xs">
              {OAUTH_SCOPE_INFO[scope].consent}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface ConsentApp {
  name: string;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  trusted: boolean;
  builtBy: string;
}

function websiteLabel(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The consent screen. Allow and Deny post the original request back to
 * /api/oauth/authorize, which checks it again before issuing a code.
 */
export function OAuthConsent({
  app,
  account,
  scopes,
  fields,
  redirectHost,
}: {
  app: ConsentApp;
  account: { name: string; email: string; image: string | null };
  scopes: OAuthScope[];
  /** The authorization request, sent back as hidden fields */
  fields: [string, string][];
  redirectHost: string;
}) {
  const router = useRouter();
  const submitted = useRef(false);
  const [decision, setDecision] = useState<"allow" | "deny" | null>(null);
  const [switching, setSwitching] = useState(false);

  const switchAccount = async () => {
    setSwitching(true);
    try {
      await authClient.signOut();
    } finally {
      router.refresh();
      setSwitching(false);
    }
  };

  return (
    <AuthorizeShell>
      <div className="flex flex-col items-center text-center">
        <div className="flex items-center gap-3">
          <OAuthAppLogo logoUrl={app.logoUrl} name={app.name} size="lg" />
          <span aria-hidden className="bg-border h-px w-6" />
          <span className="bg-foreground text-background flex size-16 items-center justify-center rounded-2xl border p-4">
            <QrdxLogo />
          </span>
        </div>
        <h1 className="mt-6 text-lg font-semibold text-balance">
          {app.name} wants to access your QRdx account
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm text-pretty">
          Built by <span className="text-foreground">{app.builtBy}</span>
          {app.websiteUrl && (
            <>
              {" · "}
              <a
                className="text-foreground inline-flex items-center gap-1 underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
                href={app.websiteUrl}
                rel="noopener noreferrer nofollow"
                target="_blank"
              >
                {websiteLabel(app.websiteUrl)}
                <ExportSquare aria-hidden className="size-3" />
              </a>
            </>
          )}
        </p>
        {app.description && (
          <p className="text-muted-foreground mt-3 text-sm text-pretty">
            {app.description}
          </p>
        )}
      </div>

      {!app.trusted && (
        <div className="bg-muted/40 mt-6 flex gap-2.5 rounded-lg border p-3 text-sm">
          <InfoCircle
            aria-hidden
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
          />
          <p className="text-pretty">
            <span className="font-medium">Unverified app.</span>{" "}
            <span className="text-muted-foreground">
              QRdx hasn't reviewed {app.name}. Only continue if you trust{" "}
              {app.builtBy}.
            </span>
          </p>
        </div>
      )}

      <div className="mt-6">
        <ScopeList appName={app.name} scopes={scopes} />
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-lg border p-3">
        {account.image ? (
          <img
            alt=""
            className="size-8 shrink-0 rounded-full"
            referrerPolicy="no-referrer"
            src={account.image}
          />
        ) : (
          <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">
            {account.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{account.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {account.email}
          </p>
        </div>
        <Button
          disabled={switching || decision !== null}
          onClick={switchAccount}
          size="sm"
          type="button"
          variant="ghost"
        >
          Switch
        </Button>
      </div>

      <form
        action="/api/oauth/authorize"
        className="mt-6"
        method="post"
        onSubmit={(event) => {
          // One decision per page: ignore double clicks.
          if (submitted.current) {
            event.preventDefault();
            return;
          }
          submitted.current = true;
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          setDecision(
            submitter?.getAttribute("value") === "allow" ? "allow" : "deny",
          );
        }}
      >
        {fields.map(([name, value]) => (
          <input key={name} name={name} type="hidden" value={value} />
        ))}
        <div className="grid grid-cols-2 gap-3">
          <Button
            aria-busy={decision === "deny"}
            name="decision"
            type="submit"
            value="deny"
            variant="outline"
          >
            {decision === "deny" ? "Cancelling…" : "Cancel"}
          </Button>
          <Button
            aria-busy={decision === "allow"}
            name="decision"
            type="submit"
            value="allow"
          >
            {decision === "allow" ? "Authorizing…" : "Authorize"}
          </Button>
        </div>
      </form>

      <p className="text-muted-foreground mt-4 text-center text-xs text-pretty">
        You'll be sent back to{" "}
        <span className="text-foreground font-medium">{redirectHost}</span>.
        Only authorize apps you trust with your QRdx data.
      </p>
    </AuthorizeShell>
  );
}
