// Where a deployment runs, from the URLs it's given: QRdx itself (qrdx.dev,
// its Vercel previews, local dev) or a self-hosted copy on its own domain.
// Pure: the app passes its URLs in (apps/app/lib/mcp-clients.ts reads them
// from the environment), so this never reads one itself.

import { isQrdxHost } from "@repo/config";

/** This machine: `next dev` or a production build started locally. */
export function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "[::1]"
  );
}

function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname;
  } catch {
    return null;
  }
}

/** Where a deployment says it lives. */
export interface DeploymentUrls {
  /** NEXT_PUBLIC_APP_URL. */
  appUrl?: string;
  /** VERCEL_PROJECT_PRODUCTION_URL: set on every Vercel deployment, previews included. */
  productionUrl?: string;
}

/**
 * Whether this deployment is QRdx itself: its app URL is on qrdx.dev (or a
 * subdomain) or local, or it's a Vercel preview of the qrdx.dev project. A
 * self-hosted copy on its own domain is not. Features that only make sense
 * for qrdx.dev (its affiliate program) are on here and off elsewhere, with
 * no setting of their own.
 */
export function isQrdxDeployment(deployment: DeploymentUrls): boolean {
  const appHost = hostOf(deployment.appUrl);
  const productionHost = hostOf(deployment.productionUrl);
  return (
    (appHost !== null && (isQrdxHost(appHost) || isLocalHost(appHost))) ||
    // A preview has its own *.vercel.app host; its project is still qrdx.dev.
    (productionHost !== null && isQrdxHost(productionHost))
  );
}
