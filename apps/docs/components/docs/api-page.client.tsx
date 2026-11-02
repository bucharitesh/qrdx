"use client";

import type { AuthProvider } from "fumadocs-openapi/playground";
import {
  type CodeUsageGenerator,
  createCodeUsageGeneratorRegistry,
} from "fumadocs-openapi/requests/generators";
import { curl } from "fumadocs-openapi/requests/generators/curl";
import { javascript } from "fumadocs-openapi/requests/generators/javascript";
import { python } from "fumadocs-openapi/requests/generators/python";
import { createOpenAPIPage } from "fumadocs-openapi/ui";
import {
  DefaultResultDisplay,
  type ResultDisplayProps,
} from "fumadocs-openapi/ui/playground/client";

// The client half of the API reference pages (components/docs/api-page.tsx).

const PUBLIC_API = "https://api.qrdx.dev/v1";
const TOKEN_HELP = "/docs/developers/quickstart#get-an-access-token";

/**
 * Try it calls this site's /api/v1 (lib/api-reference TRY_IT_SERVER); code
 * samples show the same request on the public host.
 */
export function publicApiUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.pathname === "/api/v1" ||
      parsed.pathname.startsWith("/api/v1/")
    ) {
      return `${PUBLIC_API}${parsed.pathname.slice("/api/v1".length)}${parsed.search}`;
    }
  } catch {
    // Not absolute: leave it as it is.
  }
  return url;
}

const onPublicHost = (generator: CodeUsageGenerator): CodeUsageGenerator => ({
  ...generator,
  generate: (data, context) =>
    generator.generate({ ...data, url: publicApiUrl(data.url) }, context),
});

// curl, JavaScript (fetch) and Python, in that order.
const codeUsages = createCodeUsageGeneratorRegistry();
codeUsages.add("curl", onPublicHost(curl));
codeUsages.add("js", onPublicHost(javascript));
codeUsages.add("python", onPublicHost(python));

/**
 * The OAuth scheme as a plain token field: paste `Bearer <token>`. The
 * built-in "Authorize" panel would ask for a client secret in the browser.
 */
const tokenField: AuthProvider = {
  on: ({ scheme }) => scheme.type === "oauth2",
  render: ({ Value }) => (
    <Value
      name="Authorization"
      type="header"
      description={`Paste an OAuth access token after \`Bearer \`. It is kept in this browser and sent only with your Try it requests. [How to get a token](${TOKEN_HELP})`}
    />
  ),
};

/** Explains the one failure the browser hides: a blocked cross-origin call. */
function ResultDisplay(props: ResultDisplayProps) {
  const blocked =
    props.data.type === "client_error" &&
    props.data.url.startsWith(PUBLIC_API) &&
    !props.data.url.startsWith(`${PUBLIC_API}/qr`);
  return (
    <>
      <DefaultResultDisplay {...props} />
      {blocked && (
        <p className="border-t px-4 py-2.5 text-xs text-fd-muted-foreground">
          Browsers may only call api.qrdx.dev directly for the image API. Pick
          the “This site” server above: it runs the same API.
        </p>
      )}
    </>
  );
}

export const APIPageClient = createOpenAPIPage({
  codeUsages,
  playground: {
    authProviders: [tokenField],
    components: { ResultDisplay },
    fetchOptions: {
      requestTimeout: 30,
      // Never the visitor's QRdx session cookie: only the pasted token
      // authenticates, so Try it behaves like your own code will.
      onRequestInit: (init) => ({ ...init, credentials: "omit" }),
    },
  },
});
