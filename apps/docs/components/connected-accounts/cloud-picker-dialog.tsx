"use client";

import type { PickerItem, SharedLinkResult } from "@repo/integrations";
import { CloudFilePicker } from "@repo/integrations/src/ui/cloud-file-picker";
import { useCallback } from "react";
import {
  createShareLink,
  loadPickerPage,
} from "@/lib/connected-accounts/client";

export interface PickerProvider {
  slug: string;
  name: string;
  logo: string;
}

export interface PickedLink extends SharedLinkResult {
  item: PickerItem;
}

const DESCRIPTIONS: Record<string, string> = {
  dropbox:
    "Pick a file or folder. QRdx creates its shared link, or reuses the one it already has.",
  onedrive:
    "Pick a file or folder. QRdx creates a view-only link that anyone can open.",
  box: "Pick a file or folder. QRdx turns on its shared link for anyone with the link.",
  notion:
    "Pages you shared with QRdx. Anyone can open a page once it's published to the web.",
};

const EMPTY_HINTS: Record<string, string> = {
  notion:
    "No pages yet. In Notion, open a page, click ••• → Connections and add QRdx, or reconnect and pick more pages.",
};

interface CloudPickerDialogProps {
  provider: PickerProvider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "qr": the link becomes the QR content; "file": a page block's file. */
  purpose?: "qr" | "file";
  onPicked: (result: PickedLink) => void;
}

/** The shared picker dialog wired to QRdx's integration routes. */
export function CloudPickerDialog({
  provider,
  open,
  onOpenChange,
  purpose = "qr",
  onPicked,
}: CloudPickerDialogProps) {
  const load = useCallback(
    (options: { folderId?: string; search?: string; cursor?: string }) =>
      loadPickerPage(provider.slug, options),
    [provider.slug],
  );

  const pick = useCallback(
    async (item: PickerItem) => {
      const result = await createShareLink(provider.slug, item);
      onPicked({ ...result, item });
    },
    [provider.slug, onPicked],
  );

  return (
    <CloudFilePicker
      allowFolderPick={purpose === "qr" && provider.slug !== "notion"}
      description={DESCRIPTIONS[provider.slug]}
      emptyHint={EMPTY_HINTS[provider.slug]}
      load={load}
      logoSrc={provider.logo}
      onOpenChange={onOpenChange}
      onPick={pick}
      open={open}
      providerName={provider.name}
      searchPlaceholder={
        provider.slug === "notion" ? "Search pages" : `Search ${provider.name}`
      }
    />
  );
}
