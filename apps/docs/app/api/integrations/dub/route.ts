import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { db, integration } from "@repo/database";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { generatePKCE } from "@/lib/pkce";

// GET - Check if user has Dub.sh connected OR initiate OAuth
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // If action is "connect", initiate OAuth flow
    if (action === "connect") {
      if (!env.DUB_CLIENT_ID || !env.DUB_REDIRECT_URI) {
        return NextResponse.json(
          { error: "Dub.sh OAuth not configured" },
          { status: 500 },
        );
      }

      // Generate PKCE parameters
      const { codeVerifier, codeChallenge, codeChallengeMethod } =
        generatePKCE();

      // Store code verifier in a secure cookie
      const cookieStore = await cookies();
      cookieStore.set("dub_code_verifier", codeVerifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 600, // 10 minutes
        path: "/",
      });

      const oauthUrl = new URL("https://app.dub.co/oauth/authorize");
      oauthUrl.searchParams.set("client_id", env.DUB_CLIENT_ID);
      oauthUrl.searchParams.set("redirect_uri", env.DUB_REDIRECT_URI);
      oauthUrl.searchParams.set("response_type", "code");
      oauthUrl.searchParams.set(
        "scope",
        "workspaces.read workspaces.write links.read links.write",
      );
      oauthUrl.searchParams.set("code_challenge", codeChallenge);
      oauthUrl.searchParams.set("code_challenge_method", codeChallengeMethod);

      return NextResponse.json({ url: oauthUrl.toString() });
    }

    // Otherwise, return connection status
    const existingIntegration = await db
      .select()
      .from(integration)
      .where(
        and(
          eq(integration.userId, session.user.id),
          eq(integration.provider, "dub"),
        ),
      )
      .limit(1);

    return NextResponse.json({
      connected: existingIntegration.length > 0,
      connectedAt: existingIntegration[0]?.createdAt,
      workspace: existingIntegration[0]?.metadata,
    });
  } catch (error) {
    console.error("Error fetching integration:", error);
    return NextResponse.json(
      { error: "Failed to fetch integration status" },
      { status: 500 },
    );
  }
}

// DELETE - Disconnect Dub.sh account
export async function DELETE() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await db
      .delete(integration)
      .where(
        and(
          eq(integration.userId, session.user.id),
          eq(integration.provider, "dub"),
        ),
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error disconnecting Dub.sh:", error);
    return NextResponse.json(
      { message: "Failed to disconnect Dub.sh" },
      { status: 500 },
    );
  }
}
