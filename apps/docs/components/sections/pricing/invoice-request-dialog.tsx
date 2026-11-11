"use client";

// "Pay by invoice instead" on the Business card, yearly (agency tools).
// Polar's checkout takes cards and wallets only, so this sends QRdx the
// billing details (actions/invoice-requests.ts) and the invoice is arranged
// by hand. Shown only where invoice requests are offered (qrdx.dev).

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
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { TickCircle } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useId, useState } from "react";
import { requestInvoiceAction } from "@/actions/invoice-requests";
import { soundEvent } from "@/lib/sound/emit";

export function InvoiceRequestDialog({
  open,
  onOpenChange,
  planName,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName: string;
  /** The signed-in account's email, to start the billing email with */
  email: string;
}) {
  const t = useTranslations("pricing.invoice");
  const id = useId();
  const [fields, setFields] = useState({
    company: "",
    billingEmail: email,
    country: "",
    taxId: "",
    address: "",
    notes: "",
  });
  // The session can arrive after the dialog mounts: start the billing
  // email with the account's address until the person types one.
  useEffect(() => {
    if (!email) return;
    setFields((current) =>
      current.billingEmail ? current : { ...current, billingEmail: email },
    );
  }, [email]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const set =
    (name: keyof typeof fields) => (event: { target: { value: string } }) =>
      setFields((current) => ({ ...current, [name]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await requestInvoiceAction(fields);
      if (!result.ok) {
        setError(result.error);
        soundEvent("error");
        return;
      }
      soundEvent("success");
      setSentTo(fields.billingEmail.trim());
    } catch {
      setError("Something went wrong. Email enterprise@qrdx.dev instead.");
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
              <DialogTitle>{t("title", { plan: planName })}</DialogTitle>
              <DialogDescription className="text-pretty">
                {t("description", { plan: planName })}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`${id}-company`}>{t("company")}</Label>
                <Input
                  autoComplete="organization"
                  id={`${id}-company`}
                  maxLength={200}
                  onChange={set("company")}
                  required
                  value={fields.company}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-email`}>{t("billingEmail")}</Label>
                <Input
                  autoComplete="email"
                  id={`${id}-email`}
                  maxLength={254}
                  onChange={set("billingEmail")}
                  required
                  type="email"
                  value={fields.billingEmail}
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
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`${id}-tax`}>{t("taxId")}</Label>
                <Input
                  autoComplete="off"
                  id={`${id}-tax`}
                  maxLength={64}
                  onChange={set("taxId")}
                  value={fields.taxId}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`${id}-address`}>{t("address")}</Label>
                <Textarea
                  autoComplete="street-address"
                  id={`${id}-address`}
                  maxLength={500}
                  onChange={set("address")}
                  rows={2}
                  value={fields.address}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`${id}-notes`}>{t("notes")}</Label>
                <Textarea
                  id={`${id}-notes`}
                  maxLength={1000}
                  onChange={set("notes")}
                  placeholder={t("notesPlaceholder")}
                  rows={2}
                  value={fields.notes}
                />
              </div>
            </div>

            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button disabled={busy} type="submit">
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
