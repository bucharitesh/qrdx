import type { ContentType } from "@/types/qr-content";

// The QR code generator pages (app/(home)/qr-code-generator): the hub and
// one page per content type. Kept free of the page copy (lib/qr-types-content)
// so any page can link them without loading it.

/** The generators hub. */
export const GENERATORS_PATH = "/qr-code-generator";

/** One content type's generator page: /qr-code-generator/<type>. */
export const generatorPath = (type: ContentType): string =>
  `${GENERATORS_PATH}/${type}`;
