// A short, stable catalog key for an English string (FNV-1a, base 36), for
// copy that lives in data shared by several forms, like the field schemas of
// the payment and crypto forms (components/editor/content-forms). Client-safe.
export function englishKey(english: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < english.length; i++) {
    hash ^= english.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `k${hash.toString(36)}`;
}
