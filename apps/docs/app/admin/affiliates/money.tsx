import type { ByCurrency } from "@/lib/affiliates/program";
import { currencyEntries } from "@/lib/affiliates/rules";
import { formatMinorAmount } from "@/lib/affiliates/terms";

/** "US$12.30 · ₹59.70", or a dash when there's nothing. */
export function Money({ totals }: { totals: ByCurrency }) {
  const entries = currencyEntries(totals);
  if (entries.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="tabular-nums">
      {entries
        .map(([currency, amount]) => formatMinorAmount(amount, currency))
        .join(" · ")}
    </span>
  );
}
