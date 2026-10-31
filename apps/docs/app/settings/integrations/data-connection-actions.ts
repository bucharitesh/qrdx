"use server";

import { CALCOM_API_KEY } from "@repo/integrations/src/integrations/calcom/client";
import {
  isStripeSecretKey,
  STRIPE_RESTRICTED_KEY,
} from "@repo/integrations/src/integrations/stripe/client";
import { isIntegrationApiError, type SourceKeyInput } from "@repo/integrations";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  connectLimiter,
  getSessionUserId,
} from "@/lib/connected-accounts/server";
import { HttpError } from "@/lib/error-response";
import { saveKeyConnection } from "@/lib/data-connections/server";
import { enforceRateLimits } from "@/lib/request-guards";

export type DataConnectionResult = { ok: true } | { ok: false; error: string };

const token = z
  .string()
  .trim()
  .min(8, "That looks too short")
  .max(512, "That looks too long")
  .regex(/^[\x21-\x7E]+$/, "Paste it without spaces");

const inputSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("stripe"), apiKey: token }),
  z.object({ provider: z.literal("calcom"), apiKey: token }),
  z.object({
    provider: z.literal("shopify"),
    shop: z.string().trim().min(1, "Enter your store domain").max(253),
    accessToken: token.optional(),
    clientId: token.optional(),
    clientSecret: token.optional(),
  }),
]);

const NAMES = { stripe: "Stripe", calcom: "Cal.com", shopify: "Shopify" };

function keyProblem(input: SourceKeyInput): string | null {
  if (input.provider === "stripe") {
    if (isStripeSecretKey(input.apiKey)) {
      return "That's a full secret key. Create a restricted key with Payment Links: Read instead; QRdx never stores secret keys.";
    }
    if (!STRIPE_RESTRICTED_KEY.test(input.apiKey)) {
      return "Paste a restricted key: it starts with rk_live_ or rk_test_.";
    }
  }
  if (input.provider === "calcom" && !CALCOM_API_KEY.test(input.apiKey)) {
    return "Paste a Cal.com API key: it starts with cal_live_ (or cal_ for test keys).";
  }
  if (
    input.provider === "shopify" &&
    !input.accessToken &&
    !(input.clientId && input.clientSecret)
  ) {
    return "Paste the app's client ID and secret, or an Admin API access token.";
  }
  return null;
}

/**
 * Connects Stripe (restricted key), Cal.com (API key) or Shopify (store
 * domain + token or client credentials): checked with one read call, stored
 * encrypted.
 */
export async function connectDataSourceAction(
  raw: unknown,
): Promise<DataConnectionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in to connect an account." };

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the details and try again.",
    };
  }
  const input = parsed.data as SourceKeyInput;
  const problem = keyProblem(input);
  if (problem) return { ok: false, error: problem };

  try {
    await enforceRateLimits([
      { limiter: connectLimiter, key: `integrations:data-key:${userId}` },
    ]);
    await saveKeyConnection(userId, input);
  } catch (error) {
    const name = NAMES[input.provider];
    if (error instanceof HttpError) return { ok: false, error: error.message };
    if (isIntegrationApiError(error)) {
      if (error.code === "unauthorized") {
        return { ok: false, error: `${name} didn't accept that. Check it and try again.` };
      }
      if (error.code === "forbidden") {
        return {
          ok: false,
          error:
            input.provider === "stripe"
              ? "That key can't read Payment Links. Set Payment Links to Read on the key."
              : input.provider === "shopify"
                ? "That app can't read products. Add the read_products scope and reinstall it."
                : `${name} refused access for this key.`,
        };
      }
      return { ok: false, error: error.message };
    }
    console.error(
      JSON.stringify({
        event: "integrations.key_connect_failed",
        provider: input.provider,
        error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      }),
    );
    return { ok: false, error: `Couldn't reach ${name}. Try again.` };
  }

  revalidatePath(`/settings/integrations/${input.provider}`);
  revalidatePath("/settings/integrations");
  return { ok: true };
}
