"use client";

// "Ask for a code" under the plans: registered non-profits and charities get
// a discount on Pro or Business. The form emails QRdx (actions/
// nonprofit-requests.ts), who replies with a Polar discount code. Shown only
// where the discount is offered (qrdx.dev, feature nonprofitDiscounts).

import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { TickCircle } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useId, useState } from "react";
import { requestNonprofitDiscountAction } from "@/actions/nonprofit-requests";
import {
  NONPROFIT_DISCOUNT_PERCENT,
  PAID_PLANS,
  type PaidPlan,
  PLAN_NAMES,
} from "@/lib/pricing";
import { soundEvent } from "@/lib/sound/emit";

/** Where the form says to write when it can't send (lib/nonprofit-requests.tsx). */
const SUPPORT_EMAIL = "support@qrdx.dev";

export function NonprofitRequestDialog({
  open,
  onOpenChange,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The signed-in account's email, to start the contact email with */
  email: string;
}) {
  const t = useTranslations("pricing.nonprofit");
  const id = useId();
  const [fields, setFields] = useState({
    organization: "",
    country: "",
    registration: "",
    contactEmail: email,
    plan: "pro" as PaidPlan,
  });
  // The session can arrive after the dialog mounts: start the contact email
  // with the account's address until the person types one.
  useEffect(() => {
    if (!email) return;
    setFields((current) =>
      current.contactEmail ? current : { ...current, contactEmail: email },
    );
  }, [email]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const set =
    (name: "organization" | "country" | "registration" | "contactEmail") =>
    (event: { target: { value: string } }) =>
      setFields((current) => ({ ...current, [name]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await requestNonprofitDiscountAction(fields);
      if (!result.ok) {
        setError(result.error);
        soundEvent("error");
        return;
      }
      soundEvent("success");
      setSentTo(fields.contactEmail.trim());
    } catch {
      setError(t("failed", { email: SUPPORT_EMAIL }));
      soundEvent("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {sentTo ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TickCircle aria-hidden className="size-5" />
                {t("sentTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("sent", { email: sentTo })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} type="button">
                {t("close")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription className="text-pretty">
                {t("description", { percent: NONPROFIT_DISCOUNT_PERCENT })}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`${id}-organization`}>
                  {t("organization")}
                </Label>
                <Input
                  autoComplete="organization"
                  id={`${id}-organization`}
                  maxLength={200}
                  onChange={set("organization")}
                  required
                  value={fields.organization}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-country`}>{t("country")}</Label>
                <Input
                  autoComplete="country-name"
                  id={`${id}-country`}
                  maxLength={80}
                  onChange={set("country")}
                  required
                  value={fields.country}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-plan`}>{t("plan")}</Label>
                <Select
                  onValueChange={(plan) =>
                    setFields((current) => ({
                      ...current,
                      plan: plan as PaidPlan,
                    }))
                  }
                  value={fields.plan}
                >
                  <SelectTrigger className="w-full" id={`${id}-plan`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAID_PLANS.map((plan) => (
                      <SelectItem key={plan} value={plan}>
                        {PLAN_NAMES[plan]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`${id}-registration`}>
                  {t("registration")}
                </Label>
                <Input
                  aria-describedby={`${id}-registration-hint`}
                  autoComplete="off"
                  id={`${id}-registration`}
                  maxLength={300}
                  onChange={set("registration")}
                  required
                  value={fields.registration}
                />
                <p
                  className="text-muted-foreground text-xs text-pretty"
                  id={`${id}-registration-hint`}
                >
                  {t("registrationHint")}
                </p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`${id}-email`}>{t("contactEmail")}</Label>
                <Input
                  autoComplete="email"
                  id={`${id}-email`}
                  maxLength={254}
                  onChange={set("contactEmail")}
                  required
                  type="email"
                  value={fields.contactEmail}
                />
              </div>
            </div>

            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}

            <DialogFooter className="items-center gap-3 sm:justify-between">
              <p className="text-muted-foreground text-xs text-pretty">
                {t("reply")}
              </p>
              <Button
                className="w-full shrink-0 sm:w-auto"
                disabled={busy}
                type="submit"
              >
                {busy && <Spinner aria-hidden className="animate-spin" />}
                {busy ? t("sending") : t("submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
