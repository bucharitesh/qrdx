import { generateCodeChallenge } from "@/lib/pkce";
import type { IntegrationConfig, TokenResponse } from "./types";

/**
 * Generic OAuth handler for any OAuth 2.0 provider
 */
export class OAuthHandler {
  constructor(private config: IntegrationConfig) {}

  /**
   * Generate OAuth authorization URL with PKCE
   */
  generateAuthUrl(codeVerifier: string, state?: string): string {
    if (!this.config.authUrl) {
      throw new Error(`OAuth not supported for ${this.config.slug}`);
    }

    const url = new URL(this.config.authUrl);
    url.searchParams.append("client_id", this.config.clientId);
    url.searchParams.append("redirect_uri", this.config.redirectUri);
    url.searchParams.append("response_type", "code");
    url.searchParams.append("scope", this.config.scopes.join(" "));

    // Add PKCE if supported
    if (this.config.pkce) {
      const codeChallenge = generateCodeChallenge(codeVerifier);
      url.searchParams.append("code_challenge", codeChallenge);
      url.searchParams.append("code_challenge_method", "S256");
    }

    // Add state if provided
    if (state) {
      url.searchParams.append("state", state);
    }

    return url.toString();
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForTokens(
    code: string,
    codeVerifier?: string,
  ): Promise<TokenResponse> {
    if (!this.config.tokenUrl) {
      throw new Error(`OAuth not supported for ${this.config.slug}`);
    }

    const body: Record<string, string> = {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.redirectUri,
    };

    // Add PKCE code verifier if supported
    if (this.config.pkce && codeVerifier) {
      body.code_verifier = codeVerifier;
    }

    // Use form-encoded format (most OAuth providers expect this)
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(body).toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Token exchange failed: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`,
      );
    }

    return (await response.json()) as TokenResponse;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    if (!this.config.tokenUrl) {
      throw new Error(`OAuth not supported for ${this.config.slug}`);
    }

    if (!this.config.supportsRefresh) {
      throw new Error(`Token refresh not supported for ${this.config.slug}`);
    }

    const body = {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    };

    // Use form-encoded format (most OAuth providers expect this)
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(body).toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Token refresh failed: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`,
      );
    }

    return (await response.json()) as TokenResponse;
  }

  /**
   * Validate that a token is still valid (provider-specific)
   */
  async validateToken(accessToken: string): Promise<boolean> {
    // For Dub, we can validate by calling the workspaces endpoint
    if (this.config.slug === "dub") {
      try {
        const response = await fetch("https://api.dub.co/workspaces", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        return response.ok;
      } catch {
        return false;
      }
    }

    // Default: assume token is valid (can't validate without provider-specific endpoint)
    return true;
  }
}

/**
 * Create an OAuth handler for a specific provider
 */
export function createOAuthHandler(config: IntegrationConfig): OAuthHandler {
  return new OAuthHandler(config);
}
