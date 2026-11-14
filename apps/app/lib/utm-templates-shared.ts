// Client-safe parts of saved UTM templates (lib/utm-templates.ts): types,
// limits and the summary line the panel shows.

import type { UtmConfig } from "@/lib/redirect/routing";

export const MAX_UTM_TEMPLATES = 50;
export const MAX_UTM_TEMPLATE_NAME = 60;

export interface UtmTemplateView {
  id: string;
  name: string;
  utm: UtmConfig;
  /** The viewer may rename and delete it */
  canEdit: boolean;
  /** ISO string */
  updatedAt: string;
}

export interface UtmTemplateList {
  /** false until manual-sql/0013 is applied: the panel shows no templates */
  available: boolean;
  /** The workspace's plan includes UTM parameters (and so templates) */
  allowed: boolean;
  templates: UtmTemplateView[];
}

export const isEmptyUtm = (utm: UtmConfig | null | undefined): boolean =>
  !utm ||
  (!(utm.source || utm.medium || utm.campaign || utm.term || utm.content) &&
    utm.params.length === 0);

/** "qr · print · spring-sale", "+2 more" for custom parameters. */
export function utmSummary(utm: UtmConfig): string {
  const main = [utm.source, utm.medium, utm.campaign, utm.term, utm.content]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  const extra = utm.params.length;
  if (!extra) return main;
  const more = `${extra} more`;
  return main ? `${main} · ${more}` : more;
}
