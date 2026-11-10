import type { INodePropertyOptions } from "n8n-workflow";

/** `circle-large` → `Circle Large` */
const labelFor = (value: string) =>
  value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/** Dropdown options for API values, sorted by name as n8n lists them. */
export function optionsFrom(
  values: readonly string[],
  labels: Record<string, string> = {}
): INodePropertyOptions[] {
  return values
    .map((value) => ({ name: labels[value] ?? labelFor(value), value }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
