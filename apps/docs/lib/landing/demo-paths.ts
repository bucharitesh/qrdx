// URLs for the public template gallery and demos. Kept free of the template
// registry so the dashboard picker can link to demos without loading it.

/** The public template gallery. */
export const TEMPLATES_PATH = "/templates";

/** Live demo of one template: /templates/<type>/<template id>. */
export function demoPath(type: string, variantId: string): string {
  return `${TEMPLATES_PATH}/${encodeURIComponent(type)}/${encodeURIComponent(variantId)}`;
}

/** Gallery section of a page type: /templates#<type>. */
export function gallerySectionPath(type: string): string {
  return `${TEMPLATES_PATH}#${encodeURIComponent(type)}`;
}

/**
 * The dashboard's "New page" dialog with the type and template preselected
 * (read by app/dashboard/pages/page.tsx).
 */
export function templateStartPath(type: string, variantId: string): string {
  return `/dashboard/pages?new=${encodeURIComponent(type)}&template=${encodeURIComponent(variantId)}`;
}
