import { Badge } from "@repo/design-system/components/ui/badge";
import { ArrowRight2 } from "iconsax-reactjs";
import Link from "next/link";
import { OAuthAppLogo } from "@/components/oauth/oauth-app-logo";
import type { OAuthAppView } from "@/lib/oauth-apps/service";
import { OAUTH_SCOPE_INFO } from "@/lib/oauth-scopes";

function usersLabel(count: number): string {
  return count === 1 ? "1 user" : `${count.toLocaleString("en")} users`;
}

export function OAuthAppList({ apps }: { apps: OAuthAppView[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border">
      {apps.map((app) => (
        <li key={app.id}>
          <Link
            className="hover:bg-muted/40 focus-visible:bg-muted/40 flex items-center gap-4 p-4 transition-colors outline-none"
            href={`/settings/developers/${encodeURIComponent(app.id)}`}
          >
            <OAuthAppLogo logoUrl={app.logoUrl} name={app.name} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium">{app.name}</p>
                {app.verified && <Badge variant="secondary">Verified</Badge>}
                {!app.active && <Badge variant="outline">Paused</Badge>}
              </div>
              <p className="text-muted-foreground truncate font-mono text-xs">
                {app.clientId}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {app.scopes
                  .map((scope) => OAUTH_SCOPE_INFO[scope].label)
                  .join(", ")}
                {" · "}
                {usersLabel(app.userCount)}
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
