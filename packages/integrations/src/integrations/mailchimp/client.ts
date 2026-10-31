import crypto from "node:crypto";
import {
  IntegrationApiError,
  providerRequest,
} from "../../core/http-client";
import type {
  MailchimpAudience,
  MailchimpMergeField,
  MailchimpMetadata,
} from "./types";

export const MAILCHIMP_METADATA_URL =
  "https://login.mailchimp.com/oauth2/metadata";
const PROVIDER = { slug: "mailchimp", name: "Mailchimp" };
const DATA_CENTER = /^[a-z]{2,4}\d{1,3}$/;
const LIST_ID = /^[A-Za-z0-9]{1,32}$/;

/** Mailchimp's "detail" quotes the member's email; keep the title only. */
const describeMailchimpError = (body: unknown) => {
  const title = (body as { title?: unknown })?.title;
  return typeof title === "string" && title.length <= 80
    ? `request failed (${title}).`
    : undefined;
};

/** md5 of the lowercased email (Mailchimp's member id). */
export function subscriberHash(email: string): string {
  return crypto.createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

/** Reads the account's data center after OAuth (tokens never expire). */
export function getMailchimpMetadata(
  accessToken: string
): Promise<MailchimpMetadata> {
  return providerRequest<MailchimpMetadata>(PROVIDER, MAILCHIMP_METADATA_URL, {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
}

export type MemberStatus = "subscribed" | "pending" | "transactional";

export interface UpsertMemberInput {
  email: string;
  /** Only used when the person isn't in the audience yet */
  statusIfNew: MemberStatus;
  mergeFields: Record<string, string>;
}

/** Marketing API 3.0 with an OAuth token, on the account's data center. */
export class MailchimpClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;

  constructor(accessToken: string, dataCenter: string) {
    if (!DATA_CENTER.test(dataCenter)) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 400,
        code: "bad_request",
        message: "Mailchimp data center is invalid. Reconnect Mailchimp.",
      });
    }
    this.accessToken = accessToken;
    this.baseUrl = `https://${dataCenter}.api.mailchimp.com/3.0`;
  }

  private request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return providerRequest<T>(PROVIDER, `${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      describeError: describeMailchimpError,
    });
  }

  private listPath(listId: string) {
    if (!LIST_ID.test(listId)) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 400,
        code: "bad_request",
        message: "Mailchimp audience id is invalid.",
      });
    }
    return `/lists/${listId}`;
  }

  /** Audiences, paged by offset. */
  async listAudiences(
    params: { offset?: number; count?: number } = {}
  ): Promise<{ audiences: MailchimpAudience[]; total: number }> {
    const search = new URLSearchParams({
      count: String(Math.min(Math.max(params.count ?? 100, 1), 1000)),
      offset: String(Math.max(params.offset ?? 0, 0)),
      fields: "lists.id,lists.name,lists.stats.member_count,total_items",
    });
    const data = await this.request<{
      lists: Array<{ id: string; name: string; stats?: { member_count?: number } }>;
      total_items: number;
    }>(`/lists?${search}`);
    return {
      audiences: data.lists.map((list) => ({
        id: list.id,
        name: list.name,
        memberCount: list.stats?.member_count ?? 0,
      })),
      total: data.total_items,
    };
  }

  async listMergeFields(listId: string): Promise<MailchimpMergeField[]> {
    const search = new URLSearchParams({
      count: "100",
      fields: "merge_fields.tag,merge_fields.name,merge_fields.type",
    });
    const data = await this.request<{ merge_fields: MailchimpMergeField[] }>(
      `${this.listPath(listId)}/merge-fields?${search}`
    );
    return data.merge_fields;
  }

  /**
   * Adds or updates a member (idempotent PUT by subscriber hash). The status
   * only applies to new members, so nobody who unsubscribed is re-added.
   */
  upsertMember(listId: string, input: UpsertMemberInput): Promise<unknown> {
    return this.request(
      `${this.listPath(listId)}/members/${subscriberHash(input.email)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          email_address: input.email,
          status_if_new: input.statusIfNew,
          ...(Object.keys(input.mergeFields).length > 0
            ? { merge_fields: input.mergeFields }
            : {}),
        }),
      }
    );
  }

  /** Adds tags (existing tags stay). */
  async addTags(listId: string, email: string, tags: string[]): Promise<void> {
    if (tags.length === 0) return;
    await this.request(
      `${this.listPath(listId)}/members/${subscriberHash(email)}/tags`,
      {
        method: "POST",
        body: JSON.stringify({
          tags: tags.map((name) => ({ name, status: "active" })),
        }),
      }
    );
  }
}

export function createMailchimpClient(
  accessToken: string,
  dataCenter: string
): MailchimpClient {
  return new MailchimpClient(accessToken, dataCenter);
}
