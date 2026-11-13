/** "1" or "true" turns a flag on; anything else, or unset, leaves it off. */
export function isFlagOn(value: string | null | undefined): boolean {
  const flag = value?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}
