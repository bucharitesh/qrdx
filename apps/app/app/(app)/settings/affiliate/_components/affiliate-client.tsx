"use client";

import { toast } from "@repo/design-system";
import { Tick } from "@repo/design-system/components/icons";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Copy } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { useConfirmation } from "@/components/confirm-identity/provider";
import {
  chooseReferralCodeAction,
  savePaypalEmailAction,
} from "../_lib/actions";

/** The referral link, read-only, with a copy button. */
export function ReferralLinkField({ link }: { link: string }) {
  const t = useTranslations("app.settings.affiliate.affiliateClient");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success(t("linkCopied"));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("couldntCopySelectTheLink"));
    }
  };
  // Text that wraps rather than an input, so the code at the end is never
  // cut off on a phone.
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
      <code className="bg-muted/40 min-w-0 flex-1 rounded-md border px-3 py-2 font-mono text-sm break-all select-all">
        <span className="sr-only">Your referral link: </span>
        {link}
      </code>
      <Button
        className="self-start"
        onClick={copy}
        type="button"
        variant="outline"
      >
        {copied ? <Tick aria-hidden /> : <Copy aria-hidden />}
        {copied ? t("copied") : t("copy")}
      </Button>
    </div>
  );
}

/** Where payouts go: asks "Confirm it's you" before it changes. */
export function PaypalEmailForm({ current }: { current: string | null }) {
  const t = useTranslations("app.settings.affiliate.affiliateClient");
  const id = useId();
  const router = useRouter();
  const [email, setEmail] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { withConfirmation } = useConfirmation();
  const unchanged = email.trim().toLowerCase() === (current ?? "");

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await withConfirmation(
        () => savePaypalEmailAction({ email }),
        "set-payout-email",
      );
      // Cancelled "Confirm it's you": nothing changed.
      if (result === null) return;
      if (result.ok) {
        toast.success(t("paypalEmailSaved"));
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!(isPending || unchanged)) save();
      }}
    >
      <label className="sr-only" htmlFor={id}>
        {t("paypalEmail")}
      </label>
      <div className="flex min-w-0 gap-2">
        <Input
          autoComplete="email"
          className="min-w-0"
          id={id}
          maxLength={254}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("youExampleCom")}
          required
          type="email"
          value={email}
        />
        <Button disabled={isPending || unchanged} type="submit">
          {isPending && <ModuleOrbit aria-hidden />}
          {t("save")}
        </Button>
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * Swaps the random referral code for one the affiliate chooses, once. The
 * random one keeps working. No "Confirm it's you": it doesn't change where
 * money goes.
 */
export function ChooseCodeForm({ current }: { current: string }) {
  const t = useTranslations("app.settings.affiliate.affiliateClient");
  const id = useId();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const wanted = code.trim().toLowerCase();

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await chooseReferralCodeAction({ code: wanted });
      if (result.ok) {
        toast.success(t("codeSaved"));
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!isPending && wanted && wanted !== current) save();
      }}
    >
      <label className="sr-only" htmlFor={id}>
        {t("newCode")}
      </label>
      <div className="flex min-w-0 gap-2">
        <Input
          autoCapitalize="none"
          autoComplete="off"
          className="min-w-0 font-mono"
          id={id}
          maxLength={32}
          onChange={(event) => setCode(event.target.value)}
          placeholder={current}
          spellCheck={false}
          value={code}
        />
        <Button
          disabled={isPending || !wanted || wanted === current}
          type="submit"
          variant="outline"
        >
          {isPending && <ModuleOrbit aria-hidden />}
          {t("changeOnce")}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{t("n3To32LowerCase")}</p>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
