"use client";

import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useWorkspaceHref } from "@/components/workspace-provider";

/** A code, page or webhook that isn't in this workspace (or no longer exists). */
export default function WorkspacePageNotFound() {
  const t = useTranslations("app.dashboard.notFound");
  const href = useWorkspaceHref();
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-xl font-semibold tracking-tight">
        {t("thisPageCouldNotBe")}
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        {t("itMayHaveBeenDeleted")}
      </p>
      <Button asChild variant="outline">
        <Link href={href()}>{t("backToHome")}</Link>
      </Button>
    </div>
  );
}
