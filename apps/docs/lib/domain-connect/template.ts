import { isDnsHostname } from "@/app/dashboard/domains/_lib/hostname";
import {
  type DnsRecord,
  MANUAL_CHALLENGE_LABEL,
  MANUAL_CHALLENGE_PREFIX,
} from "@/lib/custom-domains";

/**
 * QRdx's Domain Connect template: domain-connect/qrdx.dev.qrdx.json at the
 * repo root, published in github.com/Domain-Connect/Templates. The groups,
 * variables and record names here must match that file. A test applies the
 * file the way a DNS provider does and compares the result with the records
 * lib/custom-domains.ts asks for.
 *
 * The template is applied with the `host` parameter (the subdomain), so every
 * relative record lands under it:
 * - route:  CNAME `@` → %target% (Vercel's target, or a self-hosted server)
 * - vercel: TXT `_vercel.%domain%.` = vc-domain-verify=%vercel% (zone apex)
 * - qrdx:   TXT `_qrdx-challenge` = qrdx-verify=%token% (self-hosted)
 */
export const TEMPLATE_GROUPS = ["route", "vercel", "qrdx"] as const;
export type TemplateGroup = (typeof TEMPLATE_GROUPS)[number];

/**
 * The `key` parameter: host label of the public key TXT records under the
 * template's syncPubKeyDomain, which is the provider id (`_dck1.qrdx.dev`).
 */
export const SIGNING_KEY_ID = "_dck1";

const VERCEL_TXT_LABEL = "_vercel";
const VERCEL_TXT_PREFIX = "vc-domain-verify=";
const VERCEL_CODE = /^[A-Za-z0-9_-]{1,128}$/;
const MANUAL_TOKEN = /^[a-f0-9]{16,128}$/;

export interface TemplateApply {
  /** Groups to apply, in template order */
  groupIds: TemplateGroup[];
  /** Template variables (%target%, %vercel%, %token%) */
  variables: Record<string, string>;
}

const stripDot = (name: string) => name.toLowerCase().replace(/\.$/, "");

/**
 * The groups and variables that make the template write exactly `records`
 * for `hostname` in `zone`, or null when the template can't express them
 * (an apex domain, an A record, a TXT record it doesn't know, no CNAME). A
 * null here means no one-click button: the records table is the only way.
 */
export function templateApplyFor(
  records: readonly DnsRecord[],
  hostname: string,
  zone: string,
): TemplateApply | null {
  // Subdomains only: the template's CNAME sits on the host it's applied to.
  if (hostname === zone || !hostname.endsWith(`.${zone}`)) return null;

  const variables: Record<string, string> = {};
  const groups = new Set<TemplateGroup>();
  const claim = (group: TemplateGroup) => {
    if (groups.has(group)) return false;
    groups.add(group);
    return true;
  };

  for (const record of records) {
    const name = stripDot(record.name);
    const value = record.value.trim();

    if (record.type === "CNAME" && name === hostname) {
      const target = stripDot(value);
      if (!(isDnsHostname(target) && claim("route"))) return null;
      variables.target = target;
      continue;
    }

    if (record.type === "TXT" && name === `${VERCEL_TXT_LABEL}.${zone}`) {
      const rest = value.startsWith(VERCEL_TXT_PREFIX)
        ? value.slice(VERCEL_TXT_PREFIX.length)
        : null;
      const code = rest?.startsWith(`${hostname},`)
        ? rest.slice(hostname.length + 1)
        : null;
      if (!(rest && code && VERCEL_CODE.test(code) && claim("vercel"))) {
        return null;
      }
      variables.vercel = rest;
      continue;
    }

    if (
      record.type === "TXT" &&
      name === `${MANUAL_CHALLENGE_LABEL}.${hostname}`
    ) {
      const token = value.startsWith(MANUAL_CHALLENGE_PREFIX)
        ? value.slice(MANUAL_CHALLENGE_PREFIX.length)
        : "";
      if (!(MANUAL_TOKEN.test(token) && claim("qrdx"))) return null;
      variables.token = token;
      continue;
    }

    return null;
  }

  if (!groups.has("route")) return null;
  return {
    groupIds: TEMPLATE_GROUPS.filter((group) => groups.has(group)),
    variables,
  };
}
