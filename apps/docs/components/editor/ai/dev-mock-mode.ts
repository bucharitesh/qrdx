// Dev-only: replay a recorded AI response without signing in.
// /playground?tab=ai&ai-mock=theme | chat | error
export type AIMockMode = "theme" | "chat" | "error";

export function getAIMockMode(): AIMockMode | null {
  if (process.env.NODE_ENV !== "development") return null;
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("ai-mock");
  return value === "theme" || value === "chat" || value === "error"
    ? value
    : null;
}
