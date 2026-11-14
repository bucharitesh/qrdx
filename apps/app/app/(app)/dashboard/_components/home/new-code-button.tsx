"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Add } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useCreate } from "@/components/app-shell/create-actions";
import { useCan } from "@/components/workspace-provider";

/** Home's primary action: the same new-code dialog as Create in the top bar. */
export function NewCodeButton() {
  const t = useTranslations("app.dashboard.home.newCodeButton");
  const create = useCreate();
  // Viewers and billing members don't create codes (lib/permissions.ts).
  const canWrite = useCan("content.write");
  if (!canWrite) return null;
  return (
    <Button onClick={() => create("code")}>
      <Add aria-hidden />
      {t("newDynamicCode")}
    </Button>
  );
}
