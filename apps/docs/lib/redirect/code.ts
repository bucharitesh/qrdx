import "server-only";

import { qrCode } from "@repo/database";

/**
 * Columns /q/<slug> loads for the redirect pipeline (lifecycle → routing).
 * Add a column here when lifecycle.ts or routing.ts needs it.
 */
export const redirectCodeColumns = {
  id: qrCode.id,
  slug: qrCode.slug,
  kind: qrCode.kind,
  destinationUrl: qrCode.destinationUrl,
  domainId: qrCode.domainId,
  isActive: qrCode.isActive,
  archivedAt: qrCode.archivedAt,
  deletedAt: qrCode.deletedAt,
  scanCount: qrCode.scanCount,
  passwordHash: qrCode.passwordHash,
  startsAt: qrCode.startsAt,
  expiresAt: qrCode.expiresAt,
  scanLimit: qrCode.scanLimit,
  pausedAt: qrCode.pausedAt,
  fallbackUrl: qrCode.fallbackUrl,
  routing: qrCode.routing,
  utm: qrCode.utm,
  pixels: qrCode.pixels,
};

export type RedirectCode = Pick<
  typeof qrCode.$inferSelect,
  keyof typeof redirectCodeColumns
>;

export type Awaitable<T> = T | Promise<T>;
