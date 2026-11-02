// The origin a request came in on, so samples on the page (the curl shown
// with a new API key) work when pasted: localhost in development, a preview
// URL on Vercel previews, the instance's own domain when self-hosted. The
// configured base URL can't tell these apart (in development it is always
// localhost:3000). Display only: nothing is fetched from it.

const isLocalHost = (host: string) =>
  /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);

const first = (value: string | null) => value?.split(",")[0]?.trim() || null;

export function requestOrigin(headers: Headers, fallback: URL): string {
  const host =
    first(headers.get("x-forwarded-host")) ?? first(headers.get("host"));
  if (!host) return fallback.origin;
  const proto =
    first(headers.get("x-forwarded-proto")) ??
    (isLocalHost(host) ? "http" : "https");
  if (proto !== "http" && proto !== "https") return fallback.origin;
  try {
    const url = new URL(`${proto}://${host}`);
    // A host header with a path, credentials or junk isn't an origin.
    return url.host === host.toLowerCase() ? url.origin : fallback.origin;
  } catch {
    return fallback.origin;
  }
}
