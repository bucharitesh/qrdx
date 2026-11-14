// Applies a Domain Connect template the way a DNS provider does (spec
// "Template Record", "Host/Name in Template", "Variables"): records are
// relative to [host.]domain unless they end with ".", "@" is that name, and
// %domain%, %host%, %fqdn% plus the caller's variables are substituted. Only
// what QRdx's template uses (CNAME and TXT) is supported.

export interface TemplateRecord {
  groupId?: string;
  type: string;
  host: string;
  pointsTo?: string;
  data?: string;
}

export interface Template {
  providerId: string;
  serviceId: string;
  syncPubKeyDomain?: string;
  hostRequired?: boolean;
  records: TemplateRecord[];
}

export interface AppliedRecord {
  type: string;
  name: string;
  value: string;
}

export function applyTemplate(
  template: Template,
  {
    domain,
    host,
    groupIds,
    variables,
  }: {
    domain: string;
    host: string;
    groupIds: readonly string[];
    variables: Readonly<Record<string, string>>;
  },
): AppliedRecord[] {
  if (template.hostRequired && !host) {
    throw new Error("the template needs a host");
  }
  const fqdn = host ? `${host}.${domain}` : domain;
  const builtins: Record<string, string> = { domain, host, fqdn };
  const substitute = (text: string) =>
    text.replace(/%([A-Za-z0-9_-]+)%/g, (_, name: string) => {
      const value = builtins[name] ?? variables[name];
      if (value === undefined) throw new Error(`no value for %${name}%`);
      return value;
    });

  return template.records
    .filter((record) => groupIds.includes(record.groupId ?? ""))
    .map((record) => {
      if (record.type !== "CNAME" && record.type !== "TXT") {
        throw new Error(`unsupported record type ${record.type}`);
      }
      const relative = substitute(record.host);
      let name = `${relative}.${fqdn}`;
      if (relative === "@" || relative === "") name = fqdn;
      else if (relative.endsWith(".")) name = relative.slice(0, -1);
      const raw = (record.type === "TXT" ? record.data : record.pointsTo) ?? "";
      return {
        type: record.type,
        name,
        value: raw === "@" ? fqdn : substitute(raw),
      };
    });
}
