// Create and Save for the builder, on the existing server actions (passed in
// as `services`, so tests run it against fakes). Create posts the form once
// (createQrCode); a folder and tags follow with the organize actions, since
// createCodeSchema has no fields for them. Save sends only what changed.
// Errors are told apart by QRdx's typed error codes, not keyword matching.

import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import type { QRStyle } from "@/types/theme";
import type { BuilderFields } from "./types";
import {
  type BuilderErrorField,
  changedFields,
  checkDestination,
  fieldForError,
  fitStyleForSave,
} from "./validation";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export interface BuilderServices {
  createCode: (input: {
    destinationUrl: string;
    title: string | null;
    domainId: string | null;
    slug: string | null;
    style?: QRStyle;
  }) => Promise<ActionResult<QrCodeView>>;
  updateCode: (input: {
    id: string;
    destinationUrl?: string;
    title?: string;
    domainId?: string | null;
    slug?: string;
    style?: QRStyle;
  }) => Promise<ActionResult<QrCodeView>>;
  moveCodes: (input: {
    ids: string[];
    folderId: string | null;
  }) => Promise<ActionResult<unknown>>;
  setTags: (input: {
    codeId: string;
    tagIds: string[];
  }) => Promise<ActionResult<unknown>>;
}

export type SubmitResult =
  | {
      ok: true;
      code: QrCodeView;
      /** Saved, but something after it didn't apply (said out loud) */
      warnings: string[];
      /** An oversized logo was left out of the saved design */
      styleTrimmed: boolean;
    }
  | {
      ok: false;
      error: { code: string; message: string };
      field: BuilderErrorField;
    };

const NETWORK_ERROR = {
  code: "UNKNOWN_ERROR",
  message: "Couldn't reach QRdx. Check your connection and try again.",
};

/** A rejected action (network, oversized body) becomes an ordinary error. */
async function safely<T>(
  call: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await call();
  } catch {
    return { success: false, error: NETWORK_ERROR };
  }
}

function failed(error: { code: string; message: string }): SubmitResult {
  return { ok: false, error, field: fieldForError(error) };
}

/** Folder and tags after the code exists; their failures are warnings. */
async function organize(
  services: BuilderServices,
  codeId: string,
  { folder, tags }: { folder?: string | null; tags?: string[] },
): Promise<string[]> {
  const warnings: string[] = [];
  if (folder !== undefined) {
    const moved = await safely(() =>
      services.moveCodes({ ids: [codeId], folderId: folder }),
    );
    if (!moved.success) {
      warnings.push(`The folder wasn't set: ${moved.error.message}`);
    }
  }
  if (tags !== undefined) {
    const tagged = await safely(() =>
      services.setTags({ codeId, tagIds: tags }),
    );
    if (!tagged.success) {
      warnings.push(`The tags weren't set: ${tagged.error.message}`);
    }
  }
  return warnings;
}

export async function submitCreate(
  fields: BuilderFields,
  services: BuilderServices,
): Promise<SubmitResult> {
  const destination = checkDestination(fields.destination);
  if (!destination.ok) {
    return failed({ code: "VALIDATION_ERROR", message: destination.message });
  }
  const fitted = fields.style ? fitStyleForSave(fields.style) : null;
  const slug = fields.slug.trim();
  const result = await safely(() =>
    services.createCode({
      destinationUrl: destination.url,
      title: fields.title.trim() || null,
      domainId: fields.domainId,
      slug: slug || null,
      // Untouched: the server applies the workspace's default theme.
      ...(fitted && { style: fitted.style }),
    }),
  );
  if (!result.success) return failed(result.error);
  const warnings = await organize(services, result.data.id, {
    folder: fields.folderId ?? undefined,
    tags: fields.tagIds.length > 0 ? fields.tagIds : undefined,
  });
  return {
    ok: true,
    code: result.data,
    warnings,
    styleTrimmed: fitted?.trimmed ?? false,
  };
}

export async function submitUpdate(
  code: QrCodeView,
  initial: BuilderFields,
  fields: BuilderFields,
  services: BuilderServices,
  { organizationKnown }: { organizationKnown: boolean },
): Promise<SubmitResult> {
  const changes = changedFields(initial, fields);
  // Page codes open their hosted page; it's edited in the page editor.
  const destinationEditable = code.kind !== "page";
  const patch: Parameters<BuilderServices["updateCode"]>[0] = { id: code.id };
  if (destinationEditable && changes.destination) {
    const destination = checkDestination(fields.destination);
    if (!destination.ok) {
      return failed({ code: "VALIDATION_ERROR", message: destination.message });
    }
    patch.destinationUrl = destination.url;
  }
  if (changes.title) patch.title = fields.title.trim();
  // Only when changed: editing stays allowed after a downgrade.
  if (changes.domain) patch.domainId = fields.domainId;
  if (changes.slug) patch.slug = fields.slug.trim();
  let styleTrimmed = false;
  if (changes.style && fields.style) {
    const fitted = fitStyleForSave(fields.style);
    patch.style = fitted.style;
    styleTrimmed = fitted.trimmed;
  }

  let saved = code;
  if (Object.keys(patch).length > 1) {
    const result = await safely(() => services.updateCode(patch));
    if (!result.success) return failed(result.error);
    saved = result.data;
  }
  const warnings = organizationKnown
    ? await organize(services, code.id, {
        folder: changes.folder ? fields.folderId : undefined,
        tags: changes.tags ? fields.tagIds : undefined,
      })
    : [];
  return { ok: true, code: saved, warnings, styleTrimmed };
}
