"use client";
import { useTranslations } from "next-intl";

// A saved barcode's editor (its page), and the parts the new-barcode modal
// (components/code-builder/barcode-builder-modal.tsx) is built from: the
// generator's form (the same one /barcode-generator uses), a title and a
// folder above it, and what Save stores. The dashboard reaches the
// generator through this file only, so bwip-js keeps loading in one place
// (tests/barcode/render.test.ts).

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
import { useId, useState } from "react";
import { updateSavedBarcode } from "@/actions/barcodes";
import { useLocaleRouter as useRouter } from "@/components/i18n/locale-link";
import {
  BarcodeGenerator,
  type CurrentBarcode,
} from "@/components/sections/tools/barcode-generator";
import type { BarcodeFormatId } from "@/lib/barcode/formats";
import { type BarcodeStyle, styleChanges } from "@/lib/barcode/style";
import { MAX_BARCODE_TITLE } from "@/lib/barcodes/schema";
import { soundEvent } from "@/lib/sound/emit";
import type { FolderOption } from "../_lib/filters";

export {
  BarcodeContentFields,
  BarcodeDownloads,
  type BarcodeGeneratorState,
  BarcodePreview,
  BarcodeStyleFields,
  type CurrentBarcode,
  useBarcodeGenerator,
} from "@/components/sections/tools/barcode-generator";

export interface EditableBarcode {
  id: string;
  title: string | null;
  format: BarcodeFormatId;
  value: string;
  options: BarcodeStyle;
  folderId: string | null;
}

const NO_FOLDER = "none";

/** What Save stores: the barcode drawn, its title and its folder. */
export const barcodeSaveFields = (
  current: CurrentBarcode,
  title: string,
  folderId: string | null,
) => ({
  title: title.trim() || null,
  format: current.format,
  value: current.value,
  options: styleChanges(current.format, current.style),
  folderId,
});

/** What Save would store, to tell whether anything changed. */
const snapshot = (
  current: CurrentBarcode | null,
  title: string,
  folderId: string | null,
) =>
  current ? JSON.stringify(barcodeSaveFields(current, title, folderId)) : null;

/** The title and the folder, above the barcode's type. */
export function BarcodeDetailsFields({
  title,
  onTitleChange,
  folderId,
  onFolderChange,
  folders,
  disabled,
}: {
  title: string;
  onTitleChange: (title: string) => void;
  folderId: string | null;
  onFolderChange: (folderId: string | null) => void;
  /** null while they load */
  folders: FolderOption[] | null;
  disabled?: boolean;
}) {
  const t = useTranslations("app.dashboard.barcodes.barcodeEditor");
  const id = useId();
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${id}-title`}>{t("title")}</Label>
        <Input
          disabled={disabled}
          id={`${id}-title`}
          maxLength={MAX_BARCODE_TITLE}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder={t("optionalToFindItLater")}
          value={title}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${id}-folder`}>{t("folder")}</Label>
        <Select
          disabled={disabled || folders === null}
          onValueChange={(value) =>
            onFolderChange(value === NO_FOLDER ? null : value)
          }
          value={folderId ?? NO_FOLDER}
        >
          <SelectTrigger className="w-full" id={`${id}-folder`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_FOLDER}>{t("noFolder")}</SelectItem>
            {(folders ?? []).map((folder) => (
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
}

/**
 * A saved barcode's page: edit, download, save. New barcodes are made in
 * the modal.
 */
export function BarcodeEditor({
  saved,
  folders,
  readOnly,
}: {
  saved: EditableBarcode;
  folders: FolderOption[];
  /** Viewers and billing members see it without Save */
  readOnly: boolean;
}) {
  const t = useTranslations("app.dashboard.barcodes.barcodeEditor");
  const router = useRouter();
  const [title, setTitle] = useState(saved.title ?? "");
  const [folderId, setFolderId] = useState<string | null>(saved.folderId);
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    snapshot(
      { format: saved.format, value: saved.value, style: saved.options },
      saved.title ?? "",
      saved.folderId,
    ),
  );

  const save = async (current: CurrentBarcode) => {
    setSaving(true);
    const fields = barcodeSaveFields(current, title, folderId);
    try {
      const result = await updateSavedBarcode({ id: saved.id, patch: fields });
      if (!result.success) {
        soundEvent("error");
        toast.error(t("couldntSaveTheBarcode"), {
          description: result.error.message,
        });
        return;
      }
      soundEvent("success");
      setSavedSnapshot(snapshot(current, title, folderId));
      toast.success(t("barcodeSaved"));
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BarcodeGenerator
      footnote={null}
      formTop={
        <BarcodeDetailsFields
          disabled={readOnly}
          folderId={folderId}
          folders={folders}
          onFolderChange={setFolderId}
          onTitleChange={setTitle}
          title={title}
        />
      }
      initial={{
        format: saved.format,
        value: saved.value,
        style: saved.options,
      }}
      renderActions={(current) => {
        if (readOnly) return null;
        const changed = snapshot(current, title, folderId) !== savedSnapshot;
        return (
          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <p className="text-muted-foreground text-xs">
              {!current
                ? t("fixTheHighlightedInputTo")
                : changed
                  ? t("unsavedChanges")
                  : t("allChangesSaved")}
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
              {t("saveChanges")}
            </Button>
          </div>
        );
      }}
      source="dashboard"
    />
  );
}
