import { CONSENT_EARLY_SCRIPT } from "@repo/analytics/consent/consent-early";
import { InlineScript } from "@/components/csp-nonce";

/**
 * Reveals the server-rendered cookie banner before the body paints when no
 * choice is stored yet (CONSENT_EARLY_SCRIPT in
 * packages/analytics/consent/consent-early.ts). Carries the request's CSP
 * nonce on nonce routes (@repo/next-config/csp).
 */
export function ConsentEarlyScript() {
  return <InlineScript html={CONSENT_EARLY_SCRIPT} />;
}
