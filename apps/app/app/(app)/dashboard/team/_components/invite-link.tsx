"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { invitePath } from "../_lib/team";

/** Absolute invite URL on the current origin (works on previews and self-hosted). */
export function useInviteUrl(invitationId: string): string {
  const path = invitePath(invitationId);
  const [url, setUrl] = useState(path);
  useEffect(() => {
    setUrl(`${window.location.origin}${path}`);
  }, [path]);
  return url;
}

export function InviteLinkField({ invitationId }: { invitationId: string }) {
  const t = useTranslations("app.dashboard.team.inviteLink");
  const url = useInviteUrl(invitationId);
  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label={t("inviteLink")}
        className="font-mono text-xs"
        onFocus={(event) => event.currentTarget.select()}
        readOnly
        value={url}
      />
      <CopyButton
        className="size-9"
        successMessage={{ title: t("inviteLinkCopied") }}
        textToCopy={url}
      />
    </div>
  );
}

export function CopyInviteLinkButton({
  invitationId,
}: {
  invitationId: string;
}) {
  const t = useTranslations("app.dashboard.team.inviteLink");
  const url = useInviteUrl(invitationId);
  return (
    <CopyButton
      aria-label={t("copyInviteLink")}
      className="size-8"
      successMessage={{ title: t("inviteLinkCopied") }}
      textToCopy={url}
    />
  );
}
