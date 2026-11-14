import { Badge } from "@repo/design-system/components/ui/badge";
import { ArrowRight2 } from "iconsax-reactjs";
import Link from "next/link";
import { use } from "react";
import { OAuthAppLogo } from "@/components/oauth/oauth-app-logo";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import type { Translator } from "@/lib/i18n/translator";
import type { OAuthAppView } from "@/lib/oauth-apps/service";
import { OAUTH_SCOPE_INFO } from "@/lib/oauth-scopes";

function usersLabel(
  count: number,
  t: Translator<"app.settings.developers.oauthAppList">,
): string {
  return count === 1
    ? t("n1User")
    : t("valueUsers", { value: count.toLocaleString("en") });
}

export function OAuthAppList({
  apps,
  base,
}: {
  apps: OAuthAppView[];
  /** The workspace's API keys & apps page */
  base: string;
}) {
  const t = use(getAppTranslations("app.settings.developers.oauthAppList"));
  return (
    <ul className="divide-y overflow-hidden rounded-xl border">
      {apps.map((app) => (
        <li key={app.id}>
          <Link
            className="hover:bg-muted/40 focus-visible:bg-muted/40 flex items-center gap-4 p-4 transition-colors outline-none"
            href={`${base}/${encodeURIComponent(app.id)}`}
          >
            <OAuthAppLogo logoUrl={app.logoUrl} name={app.name} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium">{app.name}</p>
                {app.verified && (
                  <Badge variant="secondary">{t("verified")}</Badge>
                )}
                {!app.active && <Badge variant="outline">{t("paused")}</Badge>}
              </div>
              <p className="text-muted-foreground truncate font-mono text-xs">
                {app.clientId}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {app.scopes
                  .map((scope) => OAUTH_SCOPE_INFO[scope].label)
                  .join(", ")}
                {" · "}
                {usersLabel(app.userCount, t)}
              </p>
            </div>
            <ArrowRight2
              aria-hidden
              className="text-muted-foreground size-4 shrink-0"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
