import { AI_REQUEST_FREE_TIER_LIMIT, MAX_FREE_THEMES } from "@/lib/constants";

type Feature = {
  description: string;
  status: "done" | "pending";
};

export const FREE_SUB_FEATURES: Feature[] = [
  { description: "Full QR code customization", status: "done" },
  {
    description: `${AI_REQUEST_FREE_TIER_LIMIT} AI generated themes`,
    status: "done",
  },
  {
    description: `Save and share up to ${MAX_FREE_THEMES} themes`,
    status: "done",
  },
  { description: "Export PNG, JPG, and SVG formats", status: "done" },
  { description: "Contrast checker", status: "done" },
];

export const PRO_SUB_FEATURES: Feature[] = [
  { description: "Save and share unlimited themes", status: "done" },
  { description: "Unlimited AI generated themes", status: "done" },
  { description: "Generate themes from images using AI", status: "done" },
  { description: "Priority support", status: "done" },
  { description: "Save your own fonts and colors", status: "pending" },
];
