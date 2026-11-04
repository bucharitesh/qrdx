import "server-only";

import { HttpError } from "@/lib/error-response";
import { sniffFileType } from "@/lib/files/magic";
import { fileUrl, getReadyFile } from "@/lib/files/service";
import { logoIconDataUrl } from "@/lib/qr-design/logo";
import type { ActiveScope } from "@/lib/scope";
import { isStorageConfigured, presignDownload } from "@/lib/storage/r2";
import { logoRequestOf } from "./style";

// Logos for the API and MCP: a quick icon QRdx draws itself, or an image the
// caller uploaded, read from QRdx's own storage after checking that the
// file belongs to the caller's workspace. Nothing here fetches an address a
// caller sent: the only read is a short-lived signed GET of our own bucket,
// with a size cap and a check of the file's first bytes.

/** Largest logo file the API draws. */
export const LOGO_MAX_BYTES = 1024 * 1024;

/** Image types resvg draws into a PNG the same way browsers do. */
const LOGO_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpeg",
} as const;
type LogoMime = keyof typeof LOGO_TYPES;

const READ_TIMEOUT_MS = 10_000;

const isLogoMime = (mime: string): mime is LogoMime =>
  Object.hasOwn(LOGO_TYPES, mime);

export class LogoKeyRequiredError extends HttpError {
  constructor() {
    super(
      401,
      "UNAUTHORIZED",
      "A logo by file id needs an API key of the workspace that owns the file: send it as Authorization: Bearer qrdx_…",
      { "WWW-Authenticate": 'Bearer realm="QRdx API"' },
    );
  }
}

function storageOff(): HttpError {
  return new HttpError(
    503,
    "STORAGE_NOT_CONFIGURED",
    "File storage isn't set up on this server, so logos by file id aren't available.",
  );
}

function unusable(message: string): HttpError {
  return new HttpError(400, "VALIDATION_ERROR", message);
}

/** The workspace's file, checked to be a logo the API can draw. */
async function logoFile(scope: ActiveScope, fileId: string) {
  if (!isStorageConfigured) throw storageOff();
  let file: Awaited<ReturnType<typeof getReadyFile>>;
  try {
    file = await getReadyFile(scope, fileId);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      throw new HttpError(
        404,
        "NOT_FOUND",
        "No ready file with that id in this workspace. Upload the logo in the workspace the API key belongs to.",
      );
    }
    throw error;
  }
  if (!isLogoMime(file.mime)) {
    throw unusable("The logo must be a PNG or JPEG image.");
  }
  if (file.size > LOGO_MAX_BYTES) {
    throw unusable("The logo file must be 1 MB or smaller.");
  }
  return file as typeof file & { mime: LogoMime };
}

/** The uploaded logo as a data URL, read from storage and checked. */
export async function readLogoDataUrl(
  scope: ActiveScope,
  fileId: string,
): Promise<string> {
  const file = await logoFile(scope, fileId);
  const url = await presignDownload(file.storageKey, { expiresIn: 60 });
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  });
  if (!(response.ok && response.body)) {
    throw new Error(`Reading the logo file failed (${response.status})`);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > LOGO_MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw unusable("The logo file must be 1 MB or smaller.");
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  if (sniffFileType(bytes) !== LOGO_TYPES[file.mime]) {
    throw unusable("The logo file isn't a PNG or JPEG image.");
  }
  return `data:${file.mime};base64,${bytes.toString("base64")}`;
}

/** The uploaded logo's stable link, after the same checks (for saved styles). */
export async function logoFileLink(
  scope: ActiveScope,
  fileId: string,
): Promise<string> {
  await logoFile(scope, fileId);
  return fileUrl(fileId);
}

export interface ResolvedLogo {
  /** The image to draw (a data URL QRdx built or read) */
  drawn?: string;
  /** What a saved style keeps as customLogo */
  saved?: string;
}

/**
 * The logo a style asks for. `scope` is the API key's workspace (null
 * without a key); `purpose` "render" reads the file, "save" keeps its link.
 */
export async function resolveLogo(
  request: Parameters<typeof logoRequestOf>[0],
  scope: ActiveScope | null,
  purpose: "render" | "save",
): Promise<ResolvedLogo | null> {
  const logo = logoRequestOf(request);
  if (!logo) return null;
  if (logo.kind === "icon") {
    const url = logoIconDataUrl(logo.icon);
    return { drawn: url, saved: url };
  }
  if (!scope) throw new LogoKeyRequiredError();
  return purpose === "render"
    ? { drawn: await readLogoDataUrl(scope, logo.fileId) }
    : { saved: await logoFileLink(scope, logo.fileId) };
}
