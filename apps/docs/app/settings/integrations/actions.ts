"use server";

import {
  createOAuthHandler,
  disconnectIntegration,
  generateCodeVerifier,
  getIntegrationConfigWithEnv,
  initializeIntegrations,
} from "@repo/integrations";
import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

// Initialize integrations on module load
initializeIntegrations();

export async function connectIntegrationAction(provider: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  // Get integration config with environment credentials
  const config = getIntegrationConfigWithEnv(provider, env);

  // Generate PKCE code verifier
  const codeVerifier = generateCodeVerifier();

  // Store code verifier in cookie
  const cookieStore = await cookies();
  cookieStore.set(`${provider}_code_verifier`, codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
    sameSite: "lax",
  });

  // Create OAuth handler and generate auth URL
  const oauthHandler = createOAuthHandler(config);
  const authUrl = oauthHandler.generateAuthUrl(codeVerifier);

  return { url: authUrl };
}

export async function disconnectIntegrationAction(provider: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  await disconnectIntegration(session.user.id, provider);

  return { success: true };
}
