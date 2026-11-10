import "server-only";

import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { baseUrl } from "@/lib/metadata";
import { logoFileLink } from "@/lib/qr-api/logo";
import { FILE_ID } from "@/lib/qr-api/style";
import { logoIconDataUrl } from "@/lib/qr-design/logo";
import { LOGO_ICON_IDS, type LogoIconId } from "@/lib/qr-design/style";
import type { ActiveScope } from "@/lib/scope";
import { ValidationError } from "@/types/errors";

// A code's `style` on POST and PATCH /v1/codes: the saved-theme JSON, plus
// two API-only logo fields resolved here before the body is validated:
// - `logoFileId`: an image uploaded to the key's workspace, kept as its
//   stable link (/api/files/<id>), which the dashboard draws;
// - `logoIcon`: one of the editor's quick icons, stored as the editor
//   stores it.
// A `customLogo` must be an image data URL (as the editor saves it), a file
// link of the same workspace, the QRdx mark, or the code's current logo
// (so a GET → PATCH round trip keeps working): new logos are never taken
// from other sites.

const DATA_IMAGE = /^data:image\/(?:png|jpeg|webp|gif|svg\+xml)[;,]/;

function fileIdOfLink(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== baseUrl.origin) return null;
    const match = /^\/api\/files\/([a-z0-9]{20,40})$/.exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function resolveOne(
  fileLink: (fileId: string) => Promise<string>,
  style: Record<string, unknown>,
  path: string,
  currentLogo: () => Promise<string | null>,
): Promise<Record<string, unknown>> {
  const { logoFileId, logoIcon, ...rest } = style;
  const invalid = (field: string, message: string) =>
    new ValidationError("Invalid request body", [
      { path: `${path}.${field}`, message },
    ]);

  if (logoFileId !== undefined) {
    if (typeof logoFileId !== "string" || !FILE_ID.test(logoFileId)) {
      throw invalid("logoFileId", "Must be an uploaded file id");
    }
    return {
      ...rest,
      showLogo: rest.showLogo ?? true,
      customLogo: await fileLink(logoFileId),
    };
  }
  if (logoIcon !== undefined) {
    if (!(LOGO_ICON_IDS as readonly unknown[]).includes(logoIcon)) {
      throw invalid("logoIcon", `Must be one of ${LOGO_ICON_IDS.join(", ")}`);
    }
    return {
      ...rest,
      showLogo: rest.showLogo ?? true,
      customLogo: logoIconDataUrl(logoIcon as LogoIconId),
    };
  }
  const logo = rest.customLogo;
  if (logo === undefined || logo === null) return rest;
  if (typeof logo !== "string") {
    throw invalid("customLogo", "Must be a string");
  }
  if (DATA_IMAGE.test(logo) || logo === DEFAULT_QR_LOGO) return rest;
  if (logo === (await currentLogo())) return rest;
  const fileId = fileIdOfLink(logo);
  if (fileId) {
    // A link to this workspace's own file, kept from an earlier save.
    await fileLink(fileId);
    return rest;
  }
  throw invalid(
    "customLogo",
    "Logos from links aren't accepted: upload the image to QRdx and send its file id as logoFileId (or a data:image URL).",
  );
}

/**
 * The body with each code's logo fields resolved (arrays and single codes).
 * `currentLogo`: PATCH only, the code's stored logo, which may be sent back.
 */
export async function resolveCodeStyles(
  scope: ActiveScope,
  body: unknown,
  currentLogo: () => Promise<string | null> = async () => null,
): Promise<unknown> {
  // A batch often repeats one logo: each file is looked up once.
  const links = new Map<string, Promise<string>>();
  const fileLink = (fileId: string) => {
    let link = links.get(fileId);
    if (!link) {
      link = logoFileLink(scope, fileId);
      links.set(fileId, link);
    }
    return link;
  };
  const fix = async (code: unknown, path: string) => {
    if (!code || typeof code !== "object" || Array.isArray(code)) return code;
    const { style } = code as { style?: unknown };
    if (!style || typeof style !== "object" || Array.isArray(style)) {
      return code;
    }
    return {
      ...code,
      style: await resolveOne(
        fileLink,
        style as Record<string, unknown>,
        `${path}style`,
        currentLogo,
      ),
    };
  };
  if (Array.isArray(body)) {
    return Promise.all(body.map((code, index) => fix(code, `${index}.`)));
  }
  return fix(body, "");
}
