// Where uploaded files are referenced. Pure (no database), so it's shared by
// the usage counts, admin takedowns and tests.

const FILE_REF = /"fileId"\s*:\s*"([a-z0-9]{20,40})"/g;
const FILE_LINK = /\/api\/files\/([a-z0-9]{20,40})(?![a-z0-9])/g;

/** File ids used by landing-page content (block props `fileId`). */
export function fileIdsInContent(content: unknown): Set<string> {
  const text =
    typeof content === "string" ? content : JSON.stringify(content ?? null);
  return new Set(
    Array.from(text.matchAll(FILE_REF), (match) => match[1] as string),
  );
}

/** File ids in a link such as a code's destination (`…/api/files/<id>`). */
export function fileIdsInLink(url: string): Set<string> {
  return new Set(
    Array.from(url.matchAll(FILE_LINK), (match) => match[1] as string),
  );
}
