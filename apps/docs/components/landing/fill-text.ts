// Catalog strings for client components on hosted pages. Blocks render on
// the server for /p (in the scanner's language) and in the editor's
// preview, so they translate their text and hand client components the
// finished strings, or a template ("Open now · until {time}") for values
// only the browser knows. Keeps hydration exact: no catalog in the client.

/** `template` with each `{name}` replaced by `values[name]`. */
export function fillText(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}
