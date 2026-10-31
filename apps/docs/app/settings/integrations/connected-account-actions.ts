"use server";

import crypto from "node:crypto";
import { database as db, integration } from "@repo/database";
import {
  createShortLinkClient,
  encryptApiKey,
  getIntegrationRegistry,
  isIntegrationApiError,
  isShortLinkProvider,
  verifyShortLinkCredentials,
} from "@repo/integrations";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  connectLimiter,
  getConnection,
  getSessionUserId,
} from "@/lib/connected-accounts/server";
import { HttpError } from "@/lib/error-response";
import { isIntegrationConfigured } from "@/lib/integration-oauth";
import { enforceRateLimits } from "@/lib/request-guards";

export type ConnectedAccountActionResult =
  | { ok: true }
  | { ok: false; error: string };

const apiKeySchema = z.object({
  provider: z.string().min(1).max(64),
  apiKey: z
    .string()
    .trim()
    .min(8, "That key looks too short")
    .max(512, "That key looks too long")
    .regex(/^[\x21-\x7E]+$/, "Paste the key without spaces"),
});

const domainSchema = z.object({
  provider: z.string().min(1).max(64),
  domainId: z.string().trim().min(1).max(253),
});

async function guard(
  userId: string,
  action: string,
): Promise<ConnectedAccountActionResult | null> {
  try {
    await enforceRateLimits([
      { limiter: connectLimiter, key: `integrations:${action}:${userId}` },
    ]);
    return null;
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, error: error.message };
    throw error;
  }
}

/**
 * Connects Bitly (generic access token), Rebrandly or Short.io with a pasted
 * key: checked against the provider first, then stored encrypted.
 */
export async function connectWithApiKeyAction(
  provider: string,
  apiKey: string,
): Promise<ConnectedAccountActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in to connect an account." };

  const input = apiKeySchema.safeParse({ provider, apiKey });
  if (!input.success) {
    return {
      ok: false,
      error: input.error.issues[0]?.message ?? "Check the key and try again.",
    };
  }

  const definition = getIntegrationRegistry().get(input.data.provider);
  if (!(definition?.apiKey && isShortLinkProvider(input.data.provider))) {
    return { ok: false, error: "This integration doesn't use API keys." };
  }
  if (!isIntegrationConfigured(input.data.provider)) {
    return { ok: false, error: `${definition.name} isn't configured here.` };
  }

  const limited = await guard(userId, "api-key");
  if (limited) return limited;

  let metadata: Record<string, unknown>;
  try {
    metadata = await verifyShortLinkCredentials(
      input.data.provider,
      input.data.apiKey,
    );
  } catch (error) {
    if (
      isIntegrationApiError(error) &&
      (error.code === "unauthorized" || error.code === "forbidden")
    ) {
      return {
        ok: false,
        error: `${definition.name} didn't accept that ${definition.apiKey.label.toLowerCase()}. Check it and try again.`,
      };
    }
    return {
      ok: false,
      error: isIntegrationApiError(error)
        ? error.message
        : `Couldn't reach ${definition.name}. Try again.`,
    };
  }

  const values = {
    accessToken: encryptApiKey(input.data.apiKey),
    refreshToken: null,
    expiresAt: null,
    scopes: null,
    metadata,
    status: "active",
    updatedAt: new Date(),
  };
  const existing = await db
    .select({ id: integration.id })
    .from(integration)
    .where(
      and(
        eq(integration.userId, userId),
        eq(integration.provider, input.data.provider),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(integration)
      .set(values)
      .where(eq(integration.id, existing[0].id));
  } else {
    await db.insert(integration).values({
      id: crypto.randomUUID(),
      userId,
      provider: input.data.provider,
      createdAt: new Date(),
      ...values,
    });
  }

  revalidatePath("/settings/integrations");
  return { ok: true };
}

/** Saves which domain new links use (the Short.io domain picker). */
export async function setDefaultShortLinkDomainAction(
  provider: string,
  domainId: string,
): Promise<ConnectedAccountActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };

  const input = domainSchema.safeParse({ provider, domainId });
  if (!(input.success && isShortLinkProvider(input.data.provider))) {
    return { ok: false, error: "Pick a domain." };
  }

  const limited = await guard(userId, "domain");
  if (limited) return limited;

  const connection = await getConnection(userId, input.data.provider);
  if (connection?.status !== "active") {
    return { ok: false, error: "Connect the account first." };
  }

  try {
    const domains = await createShortLinkClient(input.data.provider, {
      accessToken: connection.accessToken,
      metadata: connection.metadata,
    }).listDomains();
    const match = domains.find((domain) => domain.id === input.data.domainId);
    if (!match)
      return { ok: false, error: "That domain isn't in your account." };

    await db
      .update(integration)
      .set({
        metadata: {
          ...connection.metadata,
          defaultDomain: { id: match.id, hostname: match.hostname },
        },
        updatedAt: new Date(),
      })
      .where(eq(integration.id, connection.id));
  } catch (error) {
    return {
      ok: false,
      error: isIntegrationApiError(error)
        ? error.message
        : "Couldn't save the domain. Try again.",
    };
  }

  revalidatePath(`/settings/integrations/${input.data.provider}`);
  return { ok: true };
}
