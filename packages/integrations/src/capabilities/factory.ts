/**
 * Server-side helpers that turn a stored integration (decrypted token +
 * metadata) into a capability client, verify pasted API keys, fetch the
 * account details saved after connecting, and revoke tokens on disconnect.
 */

import { createBitlyClient } from "../integrations/bitly/client";
import { createBoxClient, revokeBoxToken } from "../integrations/box/client";
import {
  createDropboxClient,
  revokeDropboxToken,
} from "../integrations/dropbox/client";
import {
  createNotionClient,
  revokeNotionToken,
} from "../integrations/notion/client";
import { createOneDriveClient } from "../integrations/onedrive/client";
import { createRebrandlyClient } from "../integrations/rebrandly/client";
import { createShortIoClient } from "../integrations/short-io/client";
import type { FilePickerClient } from "./file-picker";
import {
  type FilePickerProviderSlug,
  isFilePickerProvider,
  isShortLinkProvider,
  type ShortLinkProviderSlug,
} from "./providers";
import type { ShortLinkClient } from "./short-links";

type Metadata = Record<string, unknown> | null | undefined;

function readDomain(
  metadata: Metadata
): { id: string; hostname: string } | undefined {
  const value = metadata?.defaultDomain;
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { hostname?: unknown }).hostname === "string"
  ) {
    return value as { id: string; hostname: string };
  }
}

function readString(metadata: Metadata, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value ? value : undefined;
}

export function createShortLinkClient(
  provider: ShortLinkProviderSlug,
  credentials: { accessToken: string; metadata?: Metadata }
): ShortLinkClient {
  switch (provider) {
    case "bitly":
      return createBitlyClient(credentials.accessToken, {
        groupGuid: readString(credentials.metadata, "groupGuid"),
      });
    case "rebrandly":
      return createRebrandlyClient(credentials.accessToken);
    case "short-io":
      return createShortIoClient(credentials.accessToken, {
        defaultDomain: readDomain(credentials.metadata),
      });
    default:
      throw new Error(`Not a short-link provider: ${provider satisfies never}`);
  }
}

export function createFilePickerClient(
  provider: FilePickerProviderSlug,
  accessToken: string
): FilePickerClient {
  switch (provider) {
    case "dropbox":
      return createDropboxClient(accessToken);
    case "onedrive":
      return createOneDriveClient(accessToken);
    case "box":
      return createBoxClient(accessToken);
    case "notion":
      return createNotionClient(accessToken);
    default:
      throw new Error(`Not a file picker: ${provider satisfies never}`);
  }
}

/** The default domain picked in settings, if any. */
export function getDefaultShortLinkDomain(metadata: Metadata) {
  return readDomain(metadata);
}

/**
 * Checks a pasted API key / personal token against the provider and returns
 * the metadata to store with it. Throws IntegrationApiError when rejected.
 */
export async function verifyShortLinkCredentials(
  provider: ShortLinkProviderSlug,
  apiKey: string
): Promise<Record<string, unknown>> {
  switch (provider) {
    case "bitly": {
      const user = await createBitlyClient(apiKey).getUser();
      return {
        login: user.login,
        name: user.name || user.login,
        groupGuid: user.default_group_guid,
        connectedWith: "token",
      };
    }
    case "rebrandly": {
      const account = await createRebrandlyClient(apiKey).getAccount();
      return {
        accountId: account.id,
        name: account.name,
        email: account.email,
      };
    }
    case "short-io": {
      const domains = await createShortIoClient(apiKey).listDomains();
      const [first] = domains;
      return {
        domainCount: domains.length,
        ...(first
          ? { defaultDomain: { id: first.id, hostname: first.hostname } }
          : {}),
      };
    }
    default:
      throw new Error(`Not a short-link provider: ${provider satisfies never}`);
  }
}

/** Account details saved after an OAuth connection. */
export async function fetchConnectedAccountMetadata(
  provider: string,
  accessToken: string,
  tokenResponse?: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (provider === "bitly") {
    const user = await createBitlyClient(accessToken).getUser();
    return {
      login: user.login,
      name: user.name || user.login,
      groupGuid: user.default_group_guid,
      connectedWith: "oauth",
    };
  }
  if (provider === "notion") {
    const owner = tokenResponse?.owner as
      | { user?: { name?: string; person?: { email?: string } } }
      | undefined;
    return {
      workspaceId: tokenResponse?.workspace_id,
      name: tokenResponse?.workspace_name ?? owner?.user?.name,
      email: owner?.user?.person?.email,
    };
  }
  if (isFilePickerProvider(provider)) {
    const account = await createFilePickerClient(
      provider,
      accessToken
    ).getAccount();
    return { accountId: account.id, name: account.name, email: account.email };
  }
  if (isShortLinkProvider(provider)) {
    const account = await createShortLinkClient(provider, {
      accessToken,
    }).getAccount();
    return { accountId: account.id, name: account.name, email: account.email };
  }
  return null;
}

/** Providers whose API can revoke a token. */
export const REVOCABLE_PROVIDERS = ["dropbox", "box", "notion"] as const;

/**
 * Revokes the stored token where the provider supports it. Returns false
 * when there is no revoke API (the row is deleted either way).
 */
export async function revokeProviderToken(
  provider: string,
  tokens: { accessToken: string; refreshToken?: string | null },
  client?: { clientId: string; clientSecret: string }
): Promise<boolean> {
  switch (provider) {
    case "dropbox":
      await revokeDropboxToken(tokens.accessToken);
      return true;
    case "box":
      if (!client) return false;
      await revokeBoxToken({ token: tokens.accessToken, ...client });
      return true;
    case "notion":
      if (!client) return false;
      await revokeNotionToken({ token: tokens.accessToken, ...client });
      return true;
    default:
      return false;
  }
}
