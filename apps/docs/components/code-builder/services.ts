"use client";

import { moveQrCodes } from "@/actions/bulk-codes";
import {
  createQrCode,
  getQrCode,
  listQrCodes,
  updateQrCode,
} from "@/actions/qr-codes";
import { setQrCodeTags } from "@/actions/tags";
import type {
  QrCodeListItem,
  QrCodeView,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import type { BuilderServices } from "./submit";

/** The builder's writes: the dashboard's existing server actions. */
export const builderServices: BuilderServices = {
  createCode: createQrCode,
  updateCode: updateQrCode,
  moveCodes: moveQrCodes,
  setTags: setQrCodeTags,
};

export interface LoadedCode {
  code: QrCodeView;
  /** Its folder and tags; null when they couldn't be looked up */
  organization: { folderId: string | null; tagIds: string[] } | null;
}

const isListItem = (code: QrCodeView): code is QrCodeListItem =>
  Array.isArray((code as Partial<QrCodeListItem>).tags);

/**
 * A code to edit, with its folder and tags. A codes list row already has
 * them; otherwise the list action finds the row by its slug (an exact
 * match there), read-only.
 */
export async function loadCodeForEdit(
  codeId: string,
  hint?: QrCodeView,
): Promise<{ ok: true; loaded: LoadedCode } | { ok: false; message: string }> {
  if (hint && isListItem(hint)) {
    return {
      ok: true,
      loaded: {
        code: hint,
        organization: {
          folderId: hint.folderId,
          tagIds: hint.tags.map((tag) => tag.id),
        },
      },
    };
  }
  let code = hint;
  try {
    if (!code) {
      const result = await getQrCode(codeId);
      if (!result.success) return { ok: false, message: result.error.message };
      code = result.data;
    }
    const list = await listQrCodes({ status: "all", q: code.slug });
    // The list's rows carry folder and tags (QrCodeListItem) at runtime;
    // checked, not assumed.
    const row = list.success
      ? list.data.codes.find((item) => item.id === codeId)
      : undefined;
    return {
      ok: true,
      loaded: {
        code,
        organization:
          row && isListItem(row)
            ? {
                folderId: row.folderId ?? null,
                tagIds: row.tags.map((tag) => tag.id),
              }
            : null,
      },
    };
  } catch {
    if (code) return { ok: true, loaded: { code, organization: null } };
    return {
      ok: false,
      message: "Couldn't load this code. Check your connection and try again.",
    };
  }
}
