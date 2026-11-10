"use client";

import { toast } from "@repo/design-system";
import { Spinner, Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Copy } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { useConfirmation } from "@/components/confirm-identity/provider";
import { savePaypalEmailAction } from "../_lib/actions";

/** The referral link, read-only, with a copy button. */
export function ReferralLinkField({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.");
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
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

/** Where payouts go: asks "Confirm it's you" before it changes. */
export function PaypalEmailForm({ current }: { current: string | null }) {
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
        toast.success("PayPal email saved");
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
        PayPal email
      </label>
      <div className="flex min-w-0 gap-2">
        <Input
          autoComplete="email"
          className="min-w-0"
          id={id}
          maxLength={254}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
        <Button disabled={isPending || unchanged} type="submit">
          {isPending && <Spinner className="animate-spin" />}
          Save
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
