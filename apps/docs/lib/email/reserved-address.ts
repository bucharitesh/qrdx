// Names reserved for tests and examples (RFC 2606, RFC 6761): no inbox
// behind them, so mail there only bounces (and bounces hurt the sending
// domain's reputation). Test and e2e accounts use them (@qrdx.test), so no
// email of any kind goes to them (lib/email/send.ts).
const RESERVED_DOMAINS = new Set(["example.com", "example.net", "example.org"]);
const RESERVED_TLDS = new Set(["test", "invalid", "example", "localhost"]);

/** True for an address at a reserved test or example domain. */
export function isReservedEmailAddress(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  const labels = domain.replace(/\.$/, "").split(".");
  return (
    RESERVED_TLDS.has(labels.at(-1) ?? "") ||
    RESERVED_DOMAINS.has(labels.slice(-2).join("."))
  );
}
