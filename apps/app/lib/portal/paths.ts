// Client portal addresses (agency tools). Client-safe.

/** The portal of a workspace: always on QRdx's own host (see lib/portal). */
export const portalPath = (slug: string) =>
  `/portal/${encodeURIComponent(slug)}`;

export const portalCodePath = (slug: string, codeId: string) =>
  `${portalPath(slug)}/codes/${encodeURIComponent(codeId)}`;
