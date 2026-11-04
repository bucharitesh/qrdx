import "server-only";

import { database as db, utmTemplate } from "@repo/database";
import cuid from "cuid";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { isMissingSchemaError } from "@/lib/community/tables";
import { HttpError } from "@/lib/error-response";
import { cheapestPlanWith, getPlanForScope, getPlanLimits } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import {
  parseUtmConfig,
  type UtmConfig,
  utmConfigSchema,
} from "@/lib/redirect/routing";
import type { ActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import {
  isEmptyUtm,
  MAX_UTM_TEMPLATE_NAME,
  MAX_UTM_TEMPLATES,
  type UtmTemplateList,
  type UtmTemplateView,
} from "./utm-templates-shared";

// Saved UTM templates (the Dub study's gap 10): a workspace's named sets of
// UTM parameters, picked in the UTM panel to fill it. Scoped to the
// workspace, behind the same plan limit as UTM itself (`routing`). The table
// comes from manual-sql/0013; until it's applied every read says
// `available: false` and the panel shows no templates.

export type { UtmTemplateList, UtmTemplateView } from "./utm-templates-shared";

/** The utm_template table isn't there yet (manual-sql/0013). */
export class UtmTemplatesUnavailableError extends HttpError {
  constructor() {
    super(
      503,
      "UNAVAILABLE",
      "Saved UTM templates aren't available on this server yet.",
    );
    this.name = "UtmTemplatesUnavailableError";
  }
}

let missingLogged = false;

/** Runs a query; a missing table becomes UtmTemplatesUnavailableError. */
async function guarded<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isMissingSchemaError(error)) {
      if (!missingLogged) {
        missingLogged = true;
        logError(error as Error, {
          action: "utm-templates",
          hint: "Apply packages/database/manual-sql/0013_utm_template.sql",
        });
      }
      throw new UtmTemplatesUnavailableError();
    }
    throw error;
  }
}

// An explicit list, so a role added later (a read-only viewer) can't write
// until someone decides it may.
const WRITE_ROLES = new Set(["owner", "admin", "member"]);
const MANAGE_ROLES = new Set(["owner", "admin"]);

/** Creators edit their own templates; owners and admins any in the workspace. */
export function canEditUtmTemplate(
  scope: Pick<ActiveScope, "userId" | "role">,
  template: { userId: string },
): boolean {
  if (!WRITE_ROLES.has(scope.role)) return false;
  return template.userId === scope.userId || MANAGE_ROLES.has(scope.role);
}

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name the template")
  .max(
    MAX_UTM_TEMPLATE_NAME,
    `Names can be up to ${MAX_UTM_TEMPLATE_NAME} characters`,
  );

const idSchema = z.string().trim().min(1).max(64);

function parseOrThrow<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      result.error.issues[0]?.message ?? "Invalid input",
    );
  }
  return result.data;
}

function planRequired(): HttpError {
  const plan = cheapestPlanWith((limits) => limits.routing);
  return new HttpError(
    402,
    "PLAN_REQUIRED",
    `UTM templates ${plan ? `are part of ${PLAN_NAMES[plan]}` : "aren't on your plan"}.`,
  );
}

async function assertAllowed(scope: ActiveScope) {
  if (!WRITE_ROLES.has(scope.role)) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Your role can't change templates here.",
    );
  }
  if (!getPlanLimits(await getPlanForScope(scope)).routing) {
    throw planRequired();
  }
}

const workspaceWhere = (scope: ActiveScope) =>
  eq(utmTemplate.organizationId, scope.organizationId);

type Row = typeof utmTemplate.$inferSelect;

function toView(scope: ActiveScope, row: Row, utm: UtmConfig): UtmTemplateView {
  return {
    id: row.id,
    name: row.name,
    utm,
    canEdit: canEditUtmTemplate(scope, row),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Every template of the workspace, by name; `available: false` before 0013. */
export async function listUtmTemplates(
  scope: ActiveScope,
): Promise<UtmTemplateList> {
  const allowed = getPlanLimits(await getPlanForScope(scope)).routing;
  try {
    const rows = await guarded(() =>
      db
        .select()
        .from(utmTemplate)
        .where(workspaceWhere(scope))
        .orderBy(asc(utmTemplate.createdAt), asc(utmTemplate.id))
        .limit(MAX_UTM_TEMPLATES),
    );
    const templates: UtmTemplateView[] = [];
    for (const row of [...rows].sort(byName)) {
      // A row the schema no longer accepts is skipped, never shown broken.
      const utm = parseUtmConfig(row.utm);
      if (utm && !isEmptyUtm(utm)) templates.push(toView(scope, row, utm));
    }
    return { available: true, allowed, templates };
  } catch (error) {
    if (error instanceof UtmTemplatesUnavailableError) {
      return { available: false, allowed, templates: [] };
    }
    throw error;
  }
}

async function findRow(scope: ActiveScope, id: string): Promise<Row> {
  const [row] = await guarded(() =>
    db
      .select()
      .from(utmTemplate)
      .where(and(eq(utmTemplate.id, id), workspaceWhere(scope)))
      .limit(1),
  );
  if (!row) throw new HttpError(404, "NOT_FOUND", "Template not found.");
  return row;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** The workspace's template names (a workspace has at most a few dozen). */
async function workspaceNames(scope: ActiveScope) {
  return guarded(() =>
    db
      .select({ id: utmTemplate.id, name: utmTemplate.name })
      .from(utmTemplate)
      .where(workspaceWhere(scope)),
  );
}

function assertNameFree(
  names: { id: string; name: string }[],
  name: string,
  exceptId?: string,
) {
  const taken = names.some(
    (row) =>
      row.id !== exceptId && row.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) {
    throw new HttpError(
      409,
      "NAME_TAKEN",
      `There's already a template called “${name}”.`,
    );
  }
}

/** Saves the panel's current parameters under a new name. */
export async function createUtmTemplate(
  scope: ActiveScope,
  input: { name: unknown; utm: unknown },
): Promise<UtmTemplateView> {
  await assertAllowed(scope);
  const name = parseOrThrow(nameSchema, input.name);
  const utm = parseOrThrow(utmConfigSchema, input.utm);
  if (isEmptyUtm(utm)) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Fill in at least one parameter first.",
    );
  }

  const names = await workspaceNames(scope);
  if (names.length >= MAX_UTM_TEMPLATES) {
    throw new HttpError(
      400,
      "TOO_MANY_TEMPLATES",
      `A workspace can keep up to ${MAX_UTM_TEMPLATES} templates. Delete one first.`,
    );
  }
  assertNameFree(names, name);

  const now = new Date();
  const [row] = await guarded(() =>
    db
      .insert(utmTemplate)
      .values({
        id: cuid(),
        userId: scope.userId,
        organizationId: scope.organizationId,
        name,
        utm,
        createdAt: now,
        updatedAt: now,
      })
      .returning(),
  );
  if (!row) throw new Error("Template insert returned nothing");
  return toView(scope, row, utm);
}

export async function renameUtmTemplate(
  scope: ActiveScope,
  input: { id: unknown; name: unknown },
): Promise<UtmTemplateView> {
  await assertAllowed(scope);
  const id = parseOrThrow(idSchema, input.id);
  const name = parseOrThrow(nameSchema, input.name);
  const row = await findRow(scope, id);
  if (!canEditUtmTemplate(scope, row)) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only its creator or a workspace owner or admin can rename it.",
    );
  }
  assertNameFree(await workspaceNames(scope), name, row.id);
  const [updated] = await guarded(() =>
    db
      .update(utmTemplate)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(utmTemplate.id, row.id), workspaceWhere(scope)))
      .returning(),
  );
  if (!updated) throw new HttpError(404, "NOT_FOUND", "Template not found.");
  const utm = parseUtmConfig(updated.utm);
  if (!utm) throw new HttpError(404, "NOT_FOUND", "Template not found.");
  return toView(scope, updated, utm);
}

/**
 * Deletes a template. Codes filled from it keep their parameters: a
 * template is copied into the code, never linked.
 */
export async function deleteUtmTemplate(
  scope: ActiveScope,
  input: { id: unknown },
): Promise<{ id: string }> {
  const id = parseOrThrow(idSchema, input.id);
  if (!WRITE_ROLES.has(scope.role)) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Your role can't change templates here.",
    );
  }
  // Removing needs no plan, like removing UTM parameters from a code.
  const row = await findRow(scope, id);
  if (!canEditUtmTemplate(scope, row)) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only its creator or a workspace owner or admin can delete it.",
    );
  }
  await guarded(() =>
    db
      .delete(utmTemplate)
      .where(and(eq(utmTemplate.id, row.id), workspaceWhere(scope))),
  );
  return { id: row.id };
}
