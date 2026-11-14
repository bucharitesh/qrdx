import { createCollection } from "./collection";
import { INDUSTRY_GROUPS } from "./industries";
import { PLACEMENT_GROUPS } from "./placements";

export type { SeoCollection } from "./collection";
export { PAGE_TYPES, type PageTypeId } from "./page-types";
export type { Recommendation, SeoGroup, SeoTopic } from "./types";

/** /qr-codes-for/[slug] */
export const industries = createCollection({
  id: "industries",
  basePath: "/qr-codes-for",
  hubName: "QR codes by industry",
  groups: INDUSTRY_GROUPS,
  ideasHeading: (topic) => `QR code ideas for ${topic.noun}`,
  faqTitle: (topic) => `QR codes for ${topic.noun}: FAQ`,
});

/** /qr-codes-on/[slug] */
export const placements = createCollection({
  id: "placements",
  basePath: "/qr-codes-on",
  hubName: "QR codes by placement",
  groups: PLACEMENT_GROUPS,
  ideasHeading: (topic) => `What to link from QR codes on ${topic.noun}`,
  faqTitle: (topic) => `QR codes on ${topic.noun}: FAQ`,
});
