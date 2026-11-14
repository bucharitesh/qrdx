// Dev-only: replay recorded AI responses without signing in or spending.
// /playground?tab=ai&ai-mock=agent | ask | template | limit | publish | chat | error
// ("theme" is the old name of "agent"). image | logo: an attached picture
// as Image QR or as the logo, asking for content first when there is none.
const MODES = [
  "agent",
  "ask",
  "template",
  "limit",
  "publish",
  "chat",
  "error",
  "image",
  "logo",
] as const;
export type AIMockMode = (typeof MODES)[number];

export function getAIMockMode(): AIMockMode | null {
  if (process.env.NODE_ENV !== "development") return null;
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("ai-mock");
  if (value === "theme") return "agent";
  return MODES.includes(value as AIMockMode) ? (value as AIMockMode) : null;
}
