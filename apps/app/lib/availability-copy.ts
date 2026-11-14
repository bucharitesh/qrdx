// Editor copy that names providers. Built from the providers this deployment
// offers (the connections and sources endpoints leave out the ones that need
// setup in production), so nothing names a service that can't be connected.
// A line whose list comes out empty is dropped: the builders return null.

/** "A", "A or B", "A, B or C" (or "and"); "" for an empty list. */
export function listNames(
  names: readonly string[],
  conjunction: "or" | "and" = "or",
): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${conjunction} ${names.at(-1)}`;
}

interface NamedProvider {
  name: string;
  capability: "short-links" | "files";
}

/**
 * The hint under the website field before any account is connected, without
 * its trailing ": connect an account": "Shorten with Bitly or Rebrandly, or
 * pick a file from Dropbox". Null when no provider is offered here.
 */
export function linkSourcesHint(
  providers: readonly NamedProvider[],
): string | null {
  const names = (capability: NamedProvider["capability"]) =>
    listNames(
      providers
        .filter((provider) => provider.capability === capability)
        .map((provider) => provider.name),
    );
  const shorten = names("short-links");
  const pick = names("files");
  if (shorten && pick) {
    return `Shorten with ${shorten}, or pick a file from ${pick}`;
  }
  if (shorten) return `Shorten with ${shorten}`;
  if (pick) return `Pick a file from ${pick}`;
  return null;
}

/**
 * "Pick from Stripe or Shopify", for the content sources a type offers here
 * before one is connected. Null when there are none.
 */
export function sourcesHint(names: readonly string[]): string | null {
  return names.length > 0 ? `Pick from ${listNames(names)}` : null;
}
