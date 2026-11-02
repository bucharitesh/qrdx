// domain-connect/keys.mjs imports this file with Node's type stripping: keep
// it free of path aliases and of TypeScript that isn't erasable.
//
// The synchronous flow's apply URL (spec "Apply Template URL"):
// {urlSyncUX}/v2/domainTemplates/providers/{providerId}/services/{serviceId}/apply?...
//
// The query is signed as sent, so it is built once, deterministically: keys
// sorted and values form-encoded the way the Domain Connect reference library
// does it (Python's urlencode, which matches Go's url.Values.Encode). `key`
// and `sig` are appended after it and aren't covered by the signature;
// Cloudflare requires `sig` to be the very last parameter.

/** Form encoding: like encodeURIComponent, plus !'()* escaped and spaces as "+". */
export function formEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    .replace(/%20/g, "+");
}

/** `a=1&b=2`, keys sorted, both sides form-encoded. */
export function encodeQuery(params: Readonly<Record<string, string>>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${formEncode(key)}=${formEncode(params[key] as string)}`)
    .join("&");
}

/** Query parameters the protocol defines; template variables can't use them. */
const RESERVED = new Set([
  "domain",
  "host",
  "groupId",
  "redirect_uri",
  "state",
  "providerName",
  "serviceName",
  "sig",
  "key",
]);

export interface ApplyRequest {
  /** urlSyncUX from the DNS provider's settings, without a trailing slash */
  urlSyncUX: string;
  /** Our template: providerId and serviceId */
  providerId: string;
  serviceId: string;
  /** The zone (registered domain or delegated zone) */
  domain: string;
  /** The subdomain within the zone; "" for the apex */
  host: string;
  groupIds: readonly string[];
  variables: Readonly<Record<string, string>>;
  redirectUri: string;
}

/** The part of the query that gets signed. */
export function applyQuery(request: ApplyRequest): string {
  for (const name of Object.keys(request.variables)) {
    if (RESERVED.has(name)) {
      throw new Error(`"${name}" can't be a template variable`);
    }
  }
  return encodeQuery({
    ...request.variables,
    domain: request.domain,
    ...(request.host ? { host: request.host } : {}),
    ...(request.groupIds.length > 0
      ? { groupId: request.groupIds.join(",") }
      : {}),
    redirect_uri: request.redirectUri,
  });
}

export interface ApplySigner {
  /** The `key` parameter (TXT host label of the public key) */
  keyId: string;
  /** Base64 signature of the query string */
  sign: (query: string) => string;
}

export function buildApplyUrl(
  request: ApplyRequest,
  signer: ApplySigner,
): string {
  const path = [
    "v2",
    "domainTemplates",
    "providers",
    encodeURIComponent(request.providerId),
    "services",
    encodeURIComponent(request.serviceId),
    "apply",
  ].join("/");
  const query = applyQuery(request);
  const base = request.urlSyncUX.replace(/\/+$/, "");
  return `${base}/${path}?${query}&key=${formEncode(signer.keyId)}&sig=${formEncode(signer.sign(query))}`;
}
