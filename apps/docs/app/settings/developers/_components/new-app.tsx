"use client";

import { toast } from "@repo/design-system";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { createOAuthAppAction } from "../_lib/actions";
import { EMPTY_APP_VALUES, OAuthAppForm } from "./oauth-app-form";
import { ClientSecretDialog } from "./secret-dialog";

export function NewOAuthApp({
  storageEnabled,
  canUpgrade,
}: {
  storageEnabled: boolean;
  /** Personal workspace: upgrading raises the app limit */
  canUpgrade: boolean;
}) {
  const router = useRouter();
  const openUpgradeDialog = useGetProDialogStore((s) => s.openUpgradeDialog);
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
          const result = await createOAuthAppAction(input);
          if (!result.ok) {
            if (result.upgrade && canUpgrade) {
              toast.error(result.error, {
                action: {
                  label: "Upgrade",
                  onClick: () => openUpgradeDialog("pro"),
                },
              });
            }
            return result.error;
          }
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
          router.push(`/settings/developers/${encodeURIComponent(id)}`);
        }}
        title="App created"
      />
    </>
  );
}
