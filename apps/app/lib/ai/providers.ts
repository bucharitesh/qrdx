import "server-only";

import { createGateway, type LanguageModel } from "ai";
import { env } from "@/env";
import { HttpError } from "@/lib/error-response";
import { AI_MODELS, type AITextTask } from "./models";

// Every AI request goes through Vercel AI Gateway with AI_GATEWAY_API_KEY.
// Which model serves each task, and the provider options it gets, are in
// ./models.ts.

export const isAIConfigured = Boolean(env.AI_GATEWAY_API_KEY);

const notConfigured = () =>
  new HttpError(503, "AI_NOT_CONFIGURED", "AI is not configured");

/** Rejects AI requests with a 503 when AI_GATEWAY_API_KEY isn't set. */
export function assertAIConfigured(): void {
  if (!isAIConfigured) throw notConfigured();
}

let gateway: ReturnType<typeof createGateway> | undefined;

/**
 * The gateway client, with the app's key only. It's never created without
 * one: the gateway would then fall back to a Vercel OIDC token on Vercel and
 * bill AI the deployment didn't turn on.
 */
export function aiGateway(): ReturnType<typeof createGateway> {
  const apiKey = env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw notConfigured();
  gateway ??= createGateway({ apiKey });
  return gateway;
}

/** The language model for a text task (see AI_MODELS). */
export function languageModel(task: AITextTask): LanguageModel {
  return aiGateway()(AI_MODELS[task].model);
}
