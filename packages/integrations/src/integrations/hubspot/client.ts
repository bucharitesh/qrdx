import { providerRequest } from "../../core/http-client";

const BASE_URL = "https://api.hubapi.com";
export const HUBSPOT_REVOKE_URL = "https://api.hubapi.com/oauth/2026-09/token/revoke";
const PROVIDER = { slug: "hubspot", name: "HubSpot" };
/** HubSpot's batch limit. */
export const HUBSPOT_BATCH_SIZE = 100;

export interface HubSpotContactInput {
  idProperty: "email";
  id: string;
  properties: Record<string, string>;
}

export interface HubSpotBatchResult {
  status: string;
  results: Array<{ id: string; new?: boolean }>;
  numErrors?: number;
  errors?: Array<{ status?: string; category?: string }>;
}

/** HubSpot messages quote the rejected values (emails); keep the category. */
const describeHubSpotError = (body: unknown) => {
  const category = (body as { category?: unknown })?.category;
  return typeof category === "string"
    ? `request failed (${category}).`
    : undefined;
};

/** HubSpot CRM v3 with an OAuth token (crm.objects.contacts.write). */
export class HubSpotClient {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Creates or updates contacts by email (idempotent: sending the same
   * contact twice updates it). Callers dedupe emails within one batch.
   */
  batchUpsertContacts(
    inputs: HubSpotContactInput[]
  ): Promise<HubSpotBatchResult> {
    if (inputs.length > HUBSPOT_BATCH_SIZE) {
      throw new RangeError(`At most ${HUBSPOT_BATCH_SIZE} contacts per batch`);
    }
    return providerRequest<HubSpotBatchResult>(
      PROVIDER,
      `${BASE_URL}/crm/v3/objects/contacts/batch/upsert`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs }),
        describeError: describeHubSpotError,
      }
    );
  }
}

export function createHubSpotClient(accessToken: string): HubSpotClient {
  return new HubSpotClient(accessToken);
}

/** Revokes the refresh token (the app is removed from the account). */
export async function revokeHubSpotToken(options: {
  token: string;
  clientId: string;
  clientSecret: string;
}): Promise<void> {
  await providerRequest(PROVIDER, HUBSPOT_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      token: options.token,
      token_type_hint: "refresh_token",
    }).toString(),
  });
}
