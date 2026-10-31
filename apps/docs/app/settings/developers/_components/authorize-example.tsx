"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import Link from "next/link";
import { CopyButton } from "@/app/dashboard/webhooks/_components/event-checkboxes";

function Snippet({
  label,
  code,
  copy = code,
}: {
  label: string;
  code: string;
  copy?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="bg-muted/40 flex items-center justify-between gap-2 border-b py-1.5 pr-1.5 pl-3">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <CopyButton
          className="size-7"
          label={`Copy ${label.toLowerCase()}`}
          value={copy}
        />
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** The authorize URL and token request for this app, ready to adapt. */
export function AuthorizeExample({
  origin,
  clientId,
  redirectUri,
  scopes,
}: {
  origin: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
}) {
  const scope = scopes.join(" ");
  const query: [string, string][] = [
    ["response_type", "code"],
    ["client_id", clientId],
    ["redirect_uri", redirectUri],
    ["scope", scope],
    ["state", "STATE"],
    ["code_challenge", "CODE_CHALLENGE"],
    ["code_challenge_method", "S256"],
  ];
  const authorizeUrl = `${origin}/api/oauth/authorize?${new URLSearchParams(query)}`;
  const readable = [
    `${origin}/api/oauth/authorize`,
    ...query.map(
      ([key, value], index) => `  ${index ? "&" : "?"}${key}=${value}`,
    ),
  ].join("\n");
  const token = [
    `curl -X POST ${origin}/api/oauth/token \\`,
    "  -d grant_type=authorization_code \\",
    `  -d client_id=${clientId} \\`,
    "  -d client_secret=$QRDX_CLIENT_SECRET \\",
    "  -d code=$CODE \\",
    `  -d redirect_uri=${redirectUri} \\`,
    "  -d code_verifier=$CODE_VERIFIER",
  ].join("\n");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authorize URL</CardTitle>
        <CardDescription>
          Send people to this URL to install your app. Replace{" "}
          <code className="font-mono">STATE</code> with a random value you check
          on return, and <code className="font-mono">CODE_CHALLENGE</code> with
          the S256 hash of a PKCE verifier.{" "}
          <Link
            className="text-foreground underline underline-offset-4"
            href="/docs/developers/build-an-integration"
          >
            Quickstart
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Snippet code={readable} copy={authorizeUrl} label="Authorize URL" />
        <Snippet code={token} label="Token request" />
      </CardContent>
    </Card>
  );
}
