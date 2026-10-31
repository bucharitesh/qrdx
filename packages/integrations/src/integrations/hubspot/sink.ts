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
import {
  HUBSPOT_BATCH_SIZE,
  type HubSpotClient,
  type HubSpotContactInput,
} from "./client";

/** Standard contact properties offered in the mapping UI. */
export const HUBSPOT_TARGETS: SinkTarget[] = [
  { id: EMAIL_TARGET, label: "Email", types: ["email"] },
  {
    id: FULL_NAME_TARGET,
    label: "Full name (first + last)",
    hints: /^(full\s*)?name$|^your name|^name\b/i,
  },
  { id: "firstname", label: "First name", hints: /first\s*name|given/i },
  { id: "lastname", label: "Last name", hints: /last\s*name|surname|family/i },
  { id: "phone", label: "Phone number", types: ["phone"] },
  {
    id: "company",
    label: "Company name",
    hints: /company|organi[sz]ation|business/i,
  },
  { id: "jobtitle", label: "Job title", hints: /job|role|position/i },
  { id: "website", label: "Website URL", hints: /website|\burl\b|site/i },
  { id: "city", label: "City", hints: /\bcity\b|town/i },
  { id: "country", label: "Country/Region", hints: /country/i },
  { id: "zip", label: "Postal code", hints: /zip|postal|post\s*code/i },
  { id: "message", label: "Message", hints: /message|comment|question|note/i },
];

const NAMES = { first: "firstname", last: "lastname" };

/** Contact inputs for a batch: one per email (latest answer wins). */
export function hubSpotInputs(
  responses: SinkFormResponse[],
  settings: ResponseSinkSettings
): { inputs: HubSpotContactInput[]; skipped: number } {
  const inputs: HubSpotContactInput[] = [];
  let skipped = 0;
  for (const response of responses) {
    if (!isPageIncluded(settings, response.pageId)) {
      skipped++;
      continue;
    }
    const mapping = mappingFor(response, settings, HUBSPOT_TARGETS);
    const mapped = mappedValues(response, mapping, NAMES);
    if (!mapped) {
      skipped++;
      continue;
    }
    inputs.push({
      idProperty: "email",
      id: mapped.email,
      properties: { email: mapped.email, ...mapped.values },
    });
  }
  const unique = dedupeLatest(inputs, (input) => input.id);
  return { inputs: unique, skipped: skipped + inputs.length - unique.length };
}

/** Upserts the responses' contacts by email in batches of 100. */
export async function upsertResponsesToHubSpot(
  client: HubSpotClient,
  settings: ResponseSinkSettings,
  responses: SinkFormResponse[]
): Promise<SinkDeliveryResult> {
  const { inputs, skipped } = hubSpotInputs(responses, settings);
  for (let start = 0; start < inputs.length; start += HUBSPOT_BATCH_SIZE) {
    await client.batchUpsertContacts(
      inputs.slice(start, start + HUBSPOT_BATCH_SIZE)
    );
  }
  return {
    delivered: inputs.length,
    skipped,
    cursor: cursorAfter(responses, (response) => ({
      at: response.createdAt,
      id: response.id,
    })),
  };
}
