"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { useTranslations } from "next-intl";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { Snippet } from "./snippet";

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
  const t = useTranslations("app.settings.developers.authorizeExample");
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
        <CardTitle>{t("authorizeUrl")}</CardTitle>
        <CardDescription>
          {t.rich("sendPeopleToThisUrl", {
            code: (chunks) => <code className="font-mono">{chunks}</code>,
            code2: (chunks) => <code className="font-mono">{chunks}</code>,
            link: (chunks) => (
              <Link
                className="text-foreground underline underline-offset-4"
                href="/docs/developers/build-an-integration"
              >
                {chunks}
              </Link>
            ),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Snippet
          code={readable}
          copy={authorizeUrl}
          label={t("authorizeUrl")}
        />
        <Snippet code={token} label={t("tokenRequest")} />
      </CardContent>
    </Card>
  );
}
