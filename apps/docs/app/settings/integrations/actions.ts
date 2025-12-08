"use server";

import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import { disconnectIntegration } from "@/lib/integrations";
import { createOAuthHandler } from "@/lib/integrations/oauth";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import { generateCodeVerifier } from "@/lib/pkce";

export async function connectIntegrationAction(provider: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  // Get integration config
  const config = getIntegrationConfig(provider);

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

