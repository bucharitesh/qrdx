import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { ArrowLeft2, Sms } from "iconsax-reactjs";
import Link from "next/link";
import { OAuthAppLogo } from "@/components/oauth/oauth-app-logo";
import type { OAuthAppView } from "@/lib/oauth-apps/service";
import { SettingsHeader } from "../../components/settings-header";
import { AppCredentials } from "./app-credentials";
import { AuthorizeExample } from "./authorize-example";
import { formatDate } from "./format";
import { AppDangerZone, EditOAuthApp } from "./manage-app";

const SUPPORT_EMAIL = "support@qrdx.dev";

function listingMailto(app: { name: string; clientId: string }): string {
  const subject = `List ${app.name} in the QRdx integrations directory`;
  const body = [
    `App: ${app.name}`,
    `Client ID: ${app.clientId}`,
    "",
    "What it does (one line):",
    "Who it's for:",
    "Setup steps or a link to them:",
    "Support contact:",
  ].join("\n");
  return `mailto:${SUPPORT_EMAIL}?${new URLSearchParams({ subject, body }).toString().replaceAll("+", "%20")}`;
}

/** One app: credentials, install URL, settings, listing, pause and delete. */
export function OAuthAppDetailView({
  app,
  canManage,
  storageEnabled,
  origin,
}: {
  app: OAuthAppView;
  /** Owner of the workspace (team owners in a team) */
  canManage: boolean;
  storageEnabled: boolean;
  /** Public origin for the example URLs, e.g. https://qrdx.dev */
  origin: string;
}) {
  return (
    <div className="space-y-6">
      <Link
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
        href="/settings/developers"
      >
        <ArrowLeft2 aria-hidden className="size-3.5" />
        Developers
      </Link>

      <SettingsHeader
        description={`Created ${formatDate(app.createdAt)} · Updated ${formatDate(app.updatedAt)}`}
        title={
          <span className="flex min-w-0 items-center gap-3">
            <OAuthAppLogo logoUrl={app.logoUrl} name={app.name} size="sm" />
            <span className="truncate">{app.name}</span>
          </span>
        }
      >
        <Badge variant={app.verified ? "secondary" : "outline"}>
          {app.verified ? "Verified" : "Unverified"}
        </Badge>
        {!app.active && <Badge variant="outline">Paused</Badge>}
      </SettingsHeader>

      {!canManage && (
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          Only team owners can change this app or its secret.
        </p>
      )}

      <AppCredentials
        appId={app.id}
        canManage={canManage}
        clientId={app.clientId}
        createdAt={app.createdAt}
        secretRotatedAt={app.secretRotatedAt}
      />

      {app.redirectUris[0] && (
        <AuthorizeExample
          clientId={app.clientId}
          origin={origin}
          redirectUri={app.redirectUris[0]}
          scopes={app.scopes}
        />
      )}

      <EditOAuthApp
        app={app}
        canManage={canManage}
        storageEnabled={storageEnabled}
      />

      <Card>
        <CardHeader>
          <CardTitle>Get listed</CardTitle>
          <CardDescription>
            Once your integration works end to end, ask to have it added to the
            QRdx integrations directory as a community integration. Listed apps
            are reviewed and marked verified.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm" variant="outline">
            <a href={listingMailto(app)}>
              <Sms />
              Email {SUPPORT_EMAIL}
            </a>
          </Button>
        </CardContent>
      </Card>

      {canManage && <AppDangerZone app={app} />}
    </div>
  );
}
