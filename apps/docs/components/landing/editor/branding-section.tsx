"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Check, Gem, Lock } from "lucide-react";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";

function Row({
  on,
  label,
  hint,
}: {
  on: boolean;
  label: string;
  hint: string;
}) {
  return (
    <li className="flex gap-2">
      {on ? (
        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      ) : (
        <Lock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      )}
      <span>
        <span className="block text-sm">{label}</span>
        <span className="text-muted-foreground block text-xs">{hint}</span>
      </span>
    </li>
  );
}

/** What QRdx branding the page carries on the current plan, with upgrade CTAs. */
export function BrandingSection({
  badge,
  whiteLabel,
}: {
  badge: boolean;
  whiteLabel: boolean;
}) {
  const openUpgradeDialog = useGetProDialogStore(
    (state) => state.openUpgradeDialog,
  );

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-medium">Branding</h3>
      <ul className="space-y-2.5">
        <Row
          hint={
            badge
              ? 'Free pages show a small "Made with QRdx" link at the bottom.'
              : "Your page has no QRdx footer."
          }
          label="No QRdx footer (Pro)"
          on={!badge}
        />
        <Row
          hint="Your logo as the browser icon and share name; no QRdx branding anywhere. A neutral Report abuse link always stays."
          label="White-label (Business)"
          on={whiteLabel}
        />
      </ul>
      {badge ? (
        <Button
          onClick={() => openUpgradeDialog("pro")}
          size="sm"
          type="button"
          variant="outline"
        >
          <Gem />
          Remove the footer with Pro
        </Button>
      ) : (
        !whiteLabel && (
          <Button
            onClick={() => openUpgradeDialog("business")}
            size="sm"
            type="button"
            variant="outline"
          >
            <Gem />
            White-label with Business
          </Button>
        )
      )}
    </section>
  );
}
