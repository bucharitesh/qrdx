import {
  EMAIL_TARGET,
  FULL_NAME_TARGET,
  isPageIncluded,
  mappedValues,
  mappingFor,
  type ResponseSinkSettings,
  type SinkTarget,
} from "../../sinks/mapping";
import { cursorAfter, dedupeLatest } from "../../sinks/state";
import type { SinkDeliveryResult, SinkFormResponse } from "../../sinks/types";
import type { MailchimpClient, MemberStatus } from "./client";
import type { MailchimpMergeField } from "./types";

/** metadata.settings of a Mailchimp stream. */
export interface MailchimpSettings extends ResponseSinkSettings {
  audienceId: string;
  /** Added to every member QRdx adds or updates */
  tags: string[];
  /**
   * When the form has no consent checkbox: "pending" asks the person to
   * confirm by email (double opt-in); "skip" leaves them out.
   */
  withoutConsent: "pending" | "skip";
}

/** Merge types QRdx can fill from a text answer. */
const TEXT_MERGE_TYPES = new Set(["text", "phone", "url", "number", "zip"]);

const HINTS: Record<string, RegExp> = {
  FNAME: /first\s*name|given/i,
  LNAME: /last\s*name|surname|family/i,
  COMPANY: /company|organi[sz]ation|business/i,
  WEBSITE: /website|\burl\b|site/i,
};

/** Targets for one audience: email, full name, then its text merge fields. */
export function mailchimpTargets(
  mergeFields: MailchimpMergeField[]
): SinkTarget[] {
  const targets: SinkTarget[] = [
    { id: EMAIL_TARGET, label: "Email address", types: ["email"] },
    {
      id: FULL_NAME_TARGET,
      label: "Full name (first + last)",
      hints: /^(full\s*)?name$|^your name|^name\b/i,
    },
  ];
  for (const field of mergeFields) {
    if (!TEXT_MERGE_TYPES.has(field.type) || field.tag === "EMAIL") continue;
    targets.push({
      id: field.tag,
      label: field.name || field.tag,
      hints:
        HINTS[field.tag] ??
        new RegExp(`^${field.name.replace(/[^\w ]/g, "")}$`, "i"),
      types:
        field.type === "phone" || field.tag === "PHONE" ? ["phone"] : undefined,
    });
  }
  return targets;
}

const NAMES = { first: "FNAME", last: "LNAME" };

export interface MailchimpMemberPlan {
  email: string;
  statusIfNew: MemberStatus;
  mergeFields: Record<string, string>;
}

/**
 * Who to add and how, respecting consent: with a consent checkbox mapped,
 * only people who ticked it are added (as subscribed); without one, people
 * are added as pending (Mailchimp asks them to confirm) or skipped.
 */
export function mailchimpMembers(
  responses: SinkFormResponse[],
  settings: MailchimpSettings,
  targets: SinkTarget[]
): { members: MailchimpMemberPlan[]; skipped: number } {
  const members: MailchimpMemberPlan[] = [];
  let skipped = 0;
  const allowed = new Set(targets.map((target) => target.id));
  for (const response of responses) {
    if (!isPageIncluded(settings, response.pageId)) {
      skipped++;
      continue;
    }
    const mapping = mappingFor(response, settings, targets);
    // Only targets that exist in the chosen audience.
    const fields = Object.fromEntries(
      Object.entries(mapping.fields).filter(([, target]) => allowed.has(target))
    );
    const mapped = mappedValues(response, { ...mapping, fields }, NAMES);
    if (!mapped) {
      skipped++;
      continue;
    }
    const mergeFields = Object.fromEntries(
      Object.entries(mapped.values).filter(([tag]) => allowed.has(tag))
    );
    let statusIfNew: MemberStatus;
    if (mapping.consentFieldId) {
      const consent = response.answers.find(
        (answer) => answer.id === mapping.consentFieldId
      );
      if (consent?.value !== true) {
        skipped++;
        continue;
      }
      statusIfNew = "subscribed";
    } else if (settings.withoutConsent === "pending") {
      statusIfNew = "pending";
    } else {
      skipped++;
      continue;
    }
    members.push({ email: mapped.email, statusIfNew, mergeFields });
  }
  const unique = dedupeLatest(members, (member) => member.email);
  return { members: unique, skipped: skipped + members.length - unique.length };
}

/** Adds or updates each member, then applies the tags. */
export async function syncResponsesToMailchimp(
  client: MailchimpClient,
  settings: MailchimpSettings,
  targets: SinkTarget[],
  responses: SinkFormResponse[]
): Promise<SinkDeliveryResult> {
  const { members, skipped } = mailchimpMembers(responses, settings, targets);
  for (const member of members) {
    await client.upsertMember(settings.audienceId, member);
    await client.addTags(settings.audienceId, member.email, settings.tags);
  }
  return {
    delivered: members.length,
    skipped,
    cursor: cursorAfter(responses, (response) => ({
      at: response.createdAt,
      id: response.id,
    })),
  };
}
