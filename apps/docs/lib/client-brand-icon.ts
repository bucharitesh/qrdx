import { accentUse, type ClientBrand } from "@/lib/client-brands-shared";
import { logoImageSrc } from "@/lib/workspace-logo";

// The browser-tab icon of a page without QRdx marks (client-branded stats
// pages and the client portal on Business): the brand's logo, else its
// initial on its accent color as an inline SVG. Never a URL the server
// fetches: the browser loads the logo, as everywhere else.

const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] as string,
  );

export function brandIconUrl(
  brand: Pick<ClientBrand, "name" | "logo" | "accent">,
) {
  const logo = logoImageSrc(brand.logo);
  if (logo) return logo;
  const fill = brand.accent ?? "#0a0a0a";
  const text = brand.accent ? accentUse(brand.accent).onAccent : "#ffffff";
  const initial = escapeXml((brand.name.trim().charAt(0) || "C").toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${fill}"/><text x="32" y="43" font-family="ui-sans-serif,system-ui,sans-serif" font-size="32" font-weight="600" text-anchor="middle" fill="${text}">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
