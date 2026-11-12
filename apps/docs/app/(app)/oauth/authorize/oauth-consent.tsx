"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { ExportSquare, InfoCircle } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState } from "react";
import { ensureConfirmed } from "@/components/confirm-identity/actions";
import { useConfirmation } from "@/components/confirm-identity/provider";
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
  const t = useTranslations("app.oauth.authorize.oauthConsent");
  return (
    <AuthorizeShell>
      <div className="space-y-2 text-center">
        <h1 className="text-lg font-semibold">{t("thisLinkCantBeUsed")}</h1>
        <p className="text-muted-foreground text-sm">
          {t.rich("theAppThatSentYou", {
            description,
            span: (chunks) => <span className="text-foreground">{chunks}</span>,
          })}
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
  const t = useTranslations("app.oauth.authorize.oauthConsent");
  return (
    <section aria-label={t("requestedPermissions")} className="space-y-2.5">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {t("appnameWillBeAbleTo", { appName })}
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
 * /api/oauth/authorize, which checks it again before issuing a code. Allow
 * asks "Confirm it's you" first (the server refuses it otherwise); a sign-in
 * that just happened may already count.
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
  const t = useTranslations("app.oauth.authorize.oauthConsent");
  const router = useRouter();
  const { withConfirmation } = useConfirmation();
  const submitted = useRef(false);
  // "Confirm it's you" done: the next Authorize submit goes through.
  const confirmed = useRef(false);
  const [decision, setDecision] = useState<"allow" | "deny" | null>(null);
  const [switching, setSwitching] = useState(false);

  /** Asks "Confirm it's you", then posts Authorize; resets if cancelled. */
  const confirmThenAllow = async (form: HTMLFormElement) => {
    setDecision("allow");
    try {
      const result = await withConfirmation(
        () => ensureConfirmed(),
        "authorize-app",
      );
      if (result?.ok) {
        confirmed.current = true;
        // Posted by the Authorize button, so the form carries its decision.
        form.requestSubmit(
          form.querySelector<HTMLButtonElement>(
            'button[name="decision"][value="allow"]',
          ),
        );
        return;
      }
      if (result) toast.error(result.error);
    } catch {
      toast.error(t("somethingWentWrongCheckYour"));
    }
    setDecision(null);
  };

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
          {t("nameWantsToAccessYour", { name: app.name })}
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm text-pretty">
          {t("builtBy")} <span className="text-foreground">{app.builtBy}</span>
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
            <span className="font-medium">{t("unverifiedApp")}</span>{" "}
            <span className="text-muted-foreground">
              {t("qrdxHasntReviewedNameOnly", {
                name: app.name,
                builtBy: app.builtBy,
              })}
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
          {t("switch")}
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
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          const allow = submitter?.getAttribute("value") === "allow";
          if (allow && !confirmed.current) {
            event.preventDefault();
            if (decision === null) void confirmThenAllow(event.currentTarget);
            return;
          }
          submitted.current = true;
          setDecision(allow ? "allow" : "deny");
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
            {decision === "deny" ? t("cancelling") : t("cancel")}
          </Button>
          <Button
            aria-busy={decision === "allow"}
            name="decision"
            type="submit"
            value="allow"
          >
            {decision === "allow" ? t("authorizing") : t("authorize")}
          </Button>
        </div>
      </form>

      <p className="text-muted-foreground mt-4 text-center text-xs text-pretty">
        {t.rich("youllBeSentBackTo", {
          redirectHost,
          span: (chunks) => (
            <span className="text-foreground font-medium">{chunks}</span>
          ),
        })}
      </p>
    </AuthorizeShell>
  );
}
