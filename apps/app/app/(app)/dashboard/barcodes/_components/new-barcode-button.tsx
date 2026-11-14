"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Add } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useCreate } from "@/components/app-shell/create-actions";
import { useCan } from "@/components/workspace-provider";

/**
 * New barcode, on the Barcodes page: the same modal as Barcode in the top
 * bar's Create menu. `short` says "New" on phones (the header).
 */
export function NewBarcodeButton({ short }: { short?: boolean }) {
  const t = useTranslations("app.dashboard.barcodes.barcodesHeader");
  const create = useCreate();
  // Viewers and billing members don't create barcodes (lib/permissions.ts).
  const canWrite = useCan("content.write");
  if (!canWrite) return null;
  return (
    <Button onClick={() => create("barcode")}>
      <Add aria-hidden />
      {short ? (
        <>
          <span className="max-sm:hidden">{t("newBarcode")}</span>
          <span className="sm:hidden">{t("new")}</span>
        </>
      ) : (
        t("newBarcode")
      )}
    </Button>
  );
}
