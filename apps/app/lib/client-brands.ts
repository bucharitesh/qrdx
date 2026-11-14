import "server-only";

import {
  type BRAND_KIT_PURPOSES,
  brandKit,
  database as db,
  organization,
} from "@repo/database";
import cuid from "cuid";
import { and, asc, eq } from "drizzle-orm";
import {
  BRAND_NAME_MAX,
  brandNameProblem,
  CLIENT_BRANDS_MAX,
  type ClientBrand,
  normalizeAccent,
} from "@/lib/client-brands-shared";
import { isMissingSchemaError } from "@/lib/community/tables";
import { HttpError } from "@/lib/error-response";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { SNIFF_BYTES, sniffFileType } from "@/lib/files/magic";
import { baseUrl } from "@/lib/metadata";
import { assertCan } from "@/lib/permissions-server";
import {
  cheapestPlanWith,
  getPlanForScope,
  getPlanLimits,
  type PlanLimits,
} from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import type { ActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import {
  deleteObject,
  isStorageConfigured,
  publicUrl,
  putObject,
} from "@/lib/storage/r2";
import {
  LOGO_MAX_BYTES,
  type LogoMime,
  logoUrlProblem,
  workspaceLogoKey,
  workspaceLogoKeyFromUrl,
} from "@/lib/workspace-logo";

// Client brands and the portal's branding (agency tools). Both reuse the
// brand_kit table: name, logo and colors.accent, told apart by `purpose`
// (manual-sql/2026-11-11-agency.sql). Older QR design kits (purpose NULL)
// are never listed here. Logos follow the workspace logo's rules
// (lib/workspace-logo.ts): an upload under workspace-logos/<workspace>/ or
// an https URL the browser loads; the server never fetches a typed URL.

export type { ClientBrand } from "@/lib/client-brands-shared";

type Purpose = (typeof BRAND_KIT_PURPOSES)[number];

/** brand_kit.purpose isn't there yet (manual-sql/2026-11-11-agency.sql). */
export class ClientBrandsUnavailableError extends HttpError {
  constructor() {
    super(
      503,
      "UNAVAILABLE",
      "Client branding isn't available on this server yet.",
    );
    this.name = "ClientBrandsUnavailableError";
  }
}

let missingLogged = false;

/** Runs a query, turning "column/table missing" into the 503 above. */
export async function brandsGuarded<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isMissingSchemaError(error)) {
      if (!missingLogged) {
        missingLogged = true;
        logError(error as Error, {
          action: "client-brands",
          hint: "Apply packages/database/manual-sql/2026-11-11-agency.sql",
        });
      }
      throw new ClientBrandsUnavailableError();
    }
    throw error;
  }
}

/** 402 naming the cheapest plan with the feature. */
export function agencyPlanRequired(
  feature: string,
  allows: (limits: PlanLimits) => boolean,
): HttpError {
  const plan = cheapestPlanWith(allows);
  return new HttpError(
    402,
    "PLAN_REQUIRED",
    plan
      ? `${feature} ${feature.endsWith("s") ? "are" : "is"} part of ${PLAN_NAMES[plan]}.`
      : `${feature} isn't on your plan.`,
  );
}

const columns = {
  id: brandKit.id,
  name: brandKit.name,
  logo: brandKit.logo,
  colors: brandKit.colors,
};

function toBrand(row: {
  id: string;
  name: string;
  logo: string | null;
  colors: unknown;
}): ClientBrand {
  const colors = (row.colors ?? {}) as { accent?: unknown };
  return {
    id: row.id,
    name: row.name,
    logo: row.logo,
    accent: normalizeAccent(colors.accent),
  };
}

const ofPurpose = (organizationId: string, purpose: Purpose) =>
  and(
    eq(brandKit.organizationId, organizationId),
    eq(brandKit.purpose, purpose),
  );

/** The workspace's client brands, by name. */
export async function listClientBrands(
  organizationId: string,
): Promise<ClientBrand[]> {
  const rows = await brandsGuarded(() =>
    db
      .select(columns)
      .from(brandKit)
      .where(ofPurpose(organizationId, "client"))
      .orderBy(asc(brandKit.name))
      .limit(CLIENT_BRANDS_MAX),
  );
  return rows.map(toBrand);
}

/** One client brand of the workspace, or null. */
export async function findClientBrand(
  organizationId: string,
  id: string,
): Promise<ClientBrand | null> {
  const [row] = await brandsGuarded(() =>
    db
      .select(columns)
      .from(brandKit)
      .where(and(ofPurpose(organizationId, "client"), eq(brandKit.id, id)))
      .limit(1),
  );
  return row ? toBrand(row) : null;
}

/** The portal's branding row, or null when the workspace hasn't set one. */
export async function findPortalBrand(
  organizationId: string,
): Promise<ClientBrand | null> {
  const [row] = await brandsGuarded(() =>
    db
      .select(columns)
      .from(brandKit)
      .where(ofPurpose(organizationId, "portal"))
      .orderBy(asc(brandKit.createdAt))
      .limit(1),
  );
  return row ? toBrand(row) : null;
}

// ─── Saving ──────────────────────────────────────────────────────────────────

/** What to do with the logo when saving. */
export type LogoChange =
  | { kind: "keep" }
  | { kind: "remove" }
  | { kind: "url"; url: string }
  | { kind: "upload"; bytes: Uint8Array };

export interface BrandInput {
  name: string;
  accent: string | null;
  logo: LogoChange;
}

const SNIFFED_MIME: Partial<Record<string, LogoMime>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const invalid = (message: string) =>
  new HttpError(400, "VALIDATION_ERROR", message);

function checkInput(input: BrandInput): {
  name: string;
  accent: string | null;
} {
  const name = input.name.trim().slice(0, BRAND_NAME_MAX + 1);
  const problem = brandNameProblem(name);
  if (problem) throw invalid(problem);
  let accent: string | null = null;
  if (input.accent?.trim()) {
    accent = normalizeAccent(input.accent);
    if (!accent) throw invalid("Use a hex color, like #1f6feb.");
  }
  return { name, accent };
}

/** The stored logo after `change`: a new upload's URL, a typed URL, or none. */
async function resolveLogo(
  organizationId: string,
  current: string | null,
  change: LogoChange,
): Promise<string | null> {
  switch (change.kind) {
    case "keep":
      return current;
    case "remove":
      return null;
    case "url": {
      const url = change.url.trim();
      const problem = logoUrlProblem(url);
      if (problem) throw invalid(problem);
      return url;
    }
    case "upload": {
      if (!(isFeatureAvailable("fileStorage") && isStorageConfigured)) {
        throw invalid(
          "Logo uploads aren't set up on this server. Use an image URL.",
        );
      }
      if (change.bytes.byteLength === 0) throw invalid("Choose a picture.");
      if (change.bytes.byteLength > LOGO_MAX_BYTES) {
        throw invalid("That picture is too large. Try a smaller one.");
      }
      // The bytes decide the type, whatever the browser said.
      const sniffed = sniffFileType(change.bytes.subarray(0, SNIFF_BYTES));
      const mime = sniffed ? SNIFFED_MIME[sniffed] : undefined;
      if (!mime) throw invalid("Use a PNG, JPEG or WebP picture.");
      const key = workspaceLogoKey(organizationId, cuid(), mime);
      await putObject(key, change.bytes, {
        mime,
        cacheControl: "public, max-age=31536000, immutable",
      });
      return publicUrl(key) ?? new URL(`/api/${key}`, baseUrl).toString();
    }
    default:
      return current;
  }
}

/**
 * Deletes a logo upload nothing uses any more: one of this workspace's
 * uploads, not the workspace's own logo and not another brand's.
 */
async function releaseLogo(organizationId: string, logo: string | null) {
  const key = workspaceLogoKeyFromUrl(logo, organizationId);
  if (!(key && logo && isStorageConfigured)) return;
  try {
    const [[workspace], users] = await db.batch([
      db
        .select({ logo: organization.logo })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .limit(1),
      db
        .select({ id: brandKit.id })
        .from(brandKit)
        .where(
          and(
            eq(brandKit.organizationId, organizationId),
            eq(brandKit.logo, logo),
          ),
        )
        .limit(1),
    ]);
    if (workspace?.logo === logo || users.length > 0) return;
    await deleteObject(key);
  } catch (error) {
    logError(error as Error, { action: "client-brands.releaseLogo" });
  }
}

async function assertClientReports(scope: ActiveScope) {
  assertCan(scope, "content.write");
  if (!getPlanLimits(await getPlanForScope(scope)).clientReports) {
    throw agencyPlanRequired("Client branding", (l) => l.clientReports);
  }
}

/** Creates a client brand, or changes one (`id`). */
export async function saveClientBrand(
  scope: ActiveScope,
  id: string | null,
  input: BrandInput,
): Promise<ClientBrand> {
  await assertClientReports(scope);
  const { name, accent } = checkInput(input);
  const existing = id ? await findClientBrand(scope.organizationId, id) : null;
  if (id && !existing) {
    throw new HttpError(404, "NOT_FOUND", "Client brand not found.");
  }
  if (!existing) {
    const count = (await listClientBrands(scope.organizationId)).length;
    if (count >= CLIENT_BRANDS_MAX) {
      throw invalid(`A workspace can keep up to ${CLIENT_BRANDS_MAX} brands.`);
    }
  }
  const logo = await resolveLogo(
    scope.organizationId,
    existing?.logo ?? null,
    input.logo,
  );
  const colors = accent ? { accent } : {};
  if (existing) {
    await brandsGuarded(() =>
      db
        .update(brandKit)
        .set({ name, logo, colors, updatedAt: new Date() })
        .where(
          and(
            ofPurpose(scope.organizationId, "client"),
            eq(brandKit.id, existing.id),
          ),
        ),
    );
    if (existing.logo !== logo) {
      await releaseLogo(scope.organizationId, existing.logo);
    }
    return { id: existing.id, name, logo, accent };
  }
  const newId = cuid();
  await brandsGuarded(() =>
    db.insert(brandKit).values({
      id: newId,
      userId: scope.userId,
      organizationId: scope.organizationId,
      name,
      logo,
      colors,
      purpose: "client",
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  );
  return { id: newId, name, logo, accent };
}

/** Deletes a client brand; pages that showed it go back to plain. */
export async function deleteClientBrand(
  scope: ActiveScope,
  id: string,
): Promise<void> {
  assertCan(scope, "content.write");
  const existing = await findClientBrand(scope.organizationId, id);
  if (!existing)
    throw new HttpError(404, "NOT_FOUND", "Client brand not found.");
  await brandsGuarded(() =>
    db
      .delete(brandKit)
      .where(
        and(ofPurpose(scope.organizationId, "client"), eq(brandKit.id, id)),
      ),
  );
  await releaseLogo(scope.organizationId, existing.logo);
}

/**
 * Saves the portal's branding (owners and admins, Business). An empty name
 * falls back to the workspace's name when the portal renders.
 */
export async function savePortalBrand(
  scope: ActiveScope,
  input: BrandInput,
): Promise<ClientBrand> {
  assertCan(scope, "workspace.update");
  if (!getPlanLimits(await getPlanForScope(scope)).clientPortal) {
    throw agencyPlanRequired("The client portal", (l) => l.clientPortal);
  }
  const { name, accent } = checkInput(input);
  const existing = await findPortalBrand(scope.organizationId);
  const logo = await resolveLogo(
    scope.organizationId,
    existing?.logo ?? null,
    input.logo,
  );
  const colors = accent ? { accent } : {};
  if (existing) {
    await brandsGuarded(() =>
      db
        .update(brandKit)
        .set({ name, logo, colors, updatedAt: new Date() })
        .where(
          and(
            ofPurpose(scope.organizationId, "portal"),
            eq(brandKit.id, existing.id),
          ),
        ),
    );
    if (existing.logo !== logo) {
      await releaseLogo(scope.organizationId, existing.logo);
    }
    return { id: existing.id, name, logo, accent };
  }
  const id = cuid();
  await brandsGuarded(() =>
    db.insert(brandKit).values({
      id,
      userId: scope.userId,
      organizationId: scope.organizationId,
      name,
      logo,
      colors,
      purpose: "portal",
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  );
  return { id, name, logo, accent };
}
