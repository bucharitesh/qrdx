"use client";

import { toast } from "@repo/design-system";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { ExportSquare } from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { HairlineFigure } from "@/components/mockups/hairline";
import { OAuthAppLogo } from "@/components/oauth/oauth-app-logo";
import type { AuthorizedAppView } from "@/lib/oauth-apps/authorized-group";
import { OAUTH_SCOPE_INFO } from "@/lib/oauth-scopes";
import { SettingsHeader } from "../../components/settings-header";
import { formatDate } from "../../developers/_components/format";
import { revokeAuthorizedAppAction } from "../_lib/actions";

const DOCS_HREF = "/docs/developers/build-an-integration#revoking-access";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Settings → Authorized apps: everything that can use this account. */
export function AuthorizedAppsView({ apps }: { apps: AuthorizedAppView[] }) {
  const t = useTranslations("app.settings.authorizedApps.authorizedAppsView");
  const [revoking, setRevoking] = useState<AuthorizedAppView | null>(null);

  return (
    <div className="space-y-6">
      <SettingsHeader
        description={t("appsYouveAllowedToUse")}
        title={t("authorizedApps")}
      />

      {apps.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <HairlineFigure
              className="mx-auto mb-2 h-28 w-40"
              figure="AuthorizedApp"
            />
            <EmptyTitle>{t("noAppsHaveAccess")}</EmptyTitle>
            <EmptyDescription>{t("whenYouApproveAnApp")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              className="text-muted-foreground text-xs underline"
              href={DOCS_HREF}
            >
              {t("howAppAccessWorks")}
            </Link>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {apps.map((app) => (
            <li
              className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
              key={app.id}
            >
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <OAuthAppLogo logoUrl={app.logoUrl} name={app.name} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{app.name}</p>
                    {app.firstParty ? (
                      <Badge variant="secondary">{t("byQrdx")}</Badge>
                    ) : app.verified ? (
                      <Badge variant="secondary">{t("verified")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("unverified")}</Badge>
                    )}
                    {app.paused && (
                      <Badge variant="outline">{t("paused")}</Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
                    <span>{t("builtByBuiltby", { builtBy: app.builtBy })}</span>
                    {app.websiteUrl && (
                      <>
                        <span aria-hidden>·</span>
                        <a
                          className="hover:text-foreground inline-flex items-center gap-1 underline-offset-4 hover:underline"
                          href={app.websiteUrl}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {hostOf(app.websiteUrl)}
                          <ExportSquare aria-hidden className="size-3" />
                        </a>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-pretty">
                    {app.scopes.length > 0
                      ? app.scopes
                          .map((scope) => OAUTH_SCOPE_INFO[scope].consent)
                          .join(" · ")
                      : t("noApiPermissions")}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(app.lastActiveAt) !==
                    formatDate(app.authorizedAt)
                      ? t("authorizedLastActive", {
                          authorizedAt: formatDate(app.authorizedAt),
                          lastActiveAt: formatDate(app.lastActiveAt),
                        })
                      : t("authorizedOn", {
                          authorizedAt: formatDate(app.authorizedAt),
                        })}
                  </p>
                </div>
              </div>
              <Button
                className="self-start sm:self-center"
                onClick={() => setRevoking(app)}
                size="sm"
                variant="outline"
              >
                {t("revokeAccess")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <RevokeDialog app={revoking} onClose={() => setRevoking(null)} />
    </div>
  );
}

function RevokeDialog({
  app,
  onClose,
}: {
  app: AuthorizedAppView | null;
  onClose: () => void;
}) {
  const t = useTranslations("app.settings.authorizedApps.authorizedAppsView");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const revoke = () => {
    if (!app) return;
    startTransition(async () => {
      const result = await revokeAuthorizedAppAction({ appId: app.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t("nameCanNoLongerUse", { name: app.name }));
      onClose();
      router.refresh();
    });
  };

  return (
    <AlertDialog
      onOpenChange={(open) => !(open || pending) && onClose()}
      open={app !== null}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("revokeNameSAccess", { name: app?.name ?? "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("itsSignedOutOfYour")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t("cancel")}
          </AlertDialogCancel>
          <Button disabled={pending} onClick={revoke} variant="destructive">
            {pending ? t("revoking") : t("revokeAccess")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
