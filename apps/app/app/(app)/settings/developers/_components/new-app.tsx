"use client";

import { track } from "@repo/analytics";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  ConfirmIdentityProvider,
  useConfirmation,
} from "@/components/confirm-identity/provider";
import { useShowLimit } from "@/components/limits/limit-dialog";
import { useWorkspaceHref } from "@/components/workspace-provider";
import { createOAuthAppAction } from "../_lib/actions";
import { EMPTY_APP_VALUES, OAuthAppForm } from "./oauth-app-form";
import { ClientSecretDialog } from "./secret-dialog";

/** A new app's client secret asks "Confirm it's you" first. */
export function NewOAuthApp({ storageEnabled }: { storageEnabled: boolean }) {
  return (
    <ConfirmIdentityProvider>
      <NewOAuthAppForm storageEnabled={storageEnabled} />
    </ConfirmIdentityProvider>
  );
}

function NewOAuthAppForm({ storageEnabled }: { storageEnabled: boolean }) {
  const t = useTranslations("app.settings.developers.newApp");
  const inWorkspace = useWorkspaceHref();
  const router = useRouter();
  const showLimit = useShowLimit();
  const { withConfirmation } = useConfirmation();
  const [created, setCreated] = useState<{
    id: string;
    clientId: string;
    clientSecret: string;
  } | null>(null);

  return (
    <>
      <OAuthAppForm
        initial={EMPTY_APP_VALUES}
        onSubmit={async (input) => {
          const result = await withConfirmation(
            () => createOAuthAppAction(input),
            "create-oauth-app",
          );
          if (result === null) return null;
          if (!result.ok) {
            // 402 is the plan's app cap (LIMIT_REACHED): its limit card,
            // which offers the upgrade only to those who can buy it.
            if (result.upgrade) showLimit("oauthApps");
            return result.error;
          }
          track("oauth_app_created");
          setCreated({
            id: result.data.app.id,
            clientId: result.data.app.clientId,
            clientSecret: result.data.clientSecret,
          });
          return null;
        }}
        pendingLabel="Creating…"
        storageEnabled={storageEnabled}
        submitLabel="Create app"
      />
      <ClientSecretDialog
        credentials={created}
        onClose={() => {
          if (!created) return;
          const id = created.id;
          setCreated(null);
          router.push(
            inWorkspace(`/settings/developers/${encodeURIComponent(id)}`),
          );
        }}
        title={t("appCreated")}
      />
    </>
  );
}
