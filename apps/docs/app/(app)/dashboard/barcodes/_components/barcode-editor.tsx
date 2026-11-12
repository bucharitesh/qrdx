"use client";
import { useTranslations } from "next-intl";

// Editing a saved barcode, or making one: the generator's form (the same
// component /barcode-generator uses) with a title and a folder above it and
// Save under the downloads.

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Save2 } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { saveBarcode, updateSavedBarcode } from "@/actions/barcodes";
import {
  BarcodeGenerator,
  type CurrentBarcode,
} from "@/components/sections/tools/barcode-generator";
import { track } from "@/lib/analytics";
import type { BarcodeFormatId } from "@/lib/barcode/formats";
import { type BarcodeStyle, styleChanges } from "@/lib/barcode/style";
import { MAX_BARCODE_TITLE } from "@/lib/barcodes/schema";
import { soundEvent } from "@/lib/sound/emit";
import type { FolderOption } from "../_lib/filters";

export interface EditableBarcode {
  id: string;
  title: string | null;
  format: BarcodeFormatId;
  value: string;
  options: BarcodeStyle;
  folderId: string | null;
}

const NO_FOLDER = "none";

/** What Save would store, to tell whether anything changed. */
const snapshot = (
  current: CurrentBarcode | null,
  title: string,
  folderId: string | null,
) =>
  current
    ? JSON.stringify([
        current.format,
        current.value,
        styleChanges(current.format, current.style),
        title.trim(),
        folderId,
      ])
    : null;

export function BarcodeEditor({
  saved,
  folders,
  basePath,
  readOnly,
}: {
  /** null for a new barcode */
  saved: EditableBarcode | null;
  folders: FolderOption[];
  /** /dashboard/<workspace>/barcodes */
  basePath: string;
  /** Viewers and billing members see it without Save */
  readOnly: boolean;
}) {
  const t = useTranslations("app.dashboard.barcodes.barcodeEditor");
  const router = useRouter();
  const id = useId();
  const [title, setTitle] = useState(saved?.title ?? "");
  const [folderId, setFolderId] = useState<string | null>(
    saved?.folderId ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    saved
      ? snapshot(
          { format: saved.format, value: saved.value, style: saved.options },
          saved.title ?? "",
          saved.folderId,
        )
      : null,
  );

  const save = async (current: CurrentBarcode) => {
    setSaving(true);
    const fields = {
      title: title.trim() || null,
      format: current.format,
      value: current.value,
      options: styleChanges(current.format, current.style),
      folderId,
    };
    try {
      const result = saved
        ? await updateSavedBarcode({ id: saved.id, patch: fields })
        : await saveBarcode(fields);
      if (!result.success) {
        soundEvent("error");
        toast.error(t("couldntSaveTheBarcode"), {
          description: result.error.message,
        });
        return;
      }
      soundEvent("success");
      setSavedSnapshot(snapshot(current, title, folderId));
      if (saved) {
        toast.success(t("barcodeSaved"));
        router.refresh();
      } else {
        track("barcode_saved", {
          symbology: current.format,
          source: "dashboard",
        });
        toast.success(t("barcodeSaved"));
        router.replace(`${basePath}/${encodeURIComponent(result.data.id)}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const formTop = (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${id}-title`}>{t("title")}</Label>
        <Input
          disabled={readOnly}
          id={`${id}-title`}
          maxLength={MAX_BARCODE_TITLE}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("optionalToFindItLater")}
          value={title}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${id}-folder`}>{t("folder")}</Label>
        <Select
          disabled={readOnly}
          onValueChange={(value) =>
            setFolderId(value === NO_FOLDER ? null : value)
          }
          value={folderId ?? NO_FOLDER}
        >
          <SelectTrigger className="w-full" id={`${id}-folder`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_FOLDER}>{t("noFolder")}</SelectItem>
            {folders.map((folder) => (
              <SelectItem key={folder.id} value={folder.id}>
                <span style={{ paddingLeft: `${folder.depth * 0.75}rem` }}>
                  {folder.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <BarcodeGenerator
      footnote={null}
      formTop={formTop}
      initial={
        saved
          ? { format: saved.format, value: saved.value, style: saved.options }
          : undefined
      }
      renderActions={(current) => {
        if (readOnly) return null;
        const changed =
          !saved || snapshot(current, title, folderId) !== savedSnapshot;
        return (
          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <p className="text-muted-foreground text-xs">
              {!current
                ? t("fixTheHighlightedInputTo")
                : saved
                  ? changed
                    ? t("unsavedChanges")
                    : t("allChangesSaved")
                  : t("notSavedYet")}
            </p>
            <Button
              disabled={!current || saving || !changed}
              onClick={() => current && save(current)}
            >
              {saving ? (
                <Spinner className="size-4 animate-spin" />
              ) : (
                <Save2 aria-hidden className="size-4" />
              )}
              {saved ? t("saveChanges") : t("saveBarcode")}
            </Button>
          </div>
        );
      }}
      source="dashboard"
    />
  );
}
