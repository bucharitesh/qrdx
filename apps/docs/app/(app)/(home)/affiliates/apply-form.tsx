"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";
import {
  type ApplyState,
  applyForAffiliateAction,
  getAffiliateApplyState,
} from "@/app/settings/affiliate/_lib/actions";
import { signInPath } from "@/lib/safe-redirect";

const TEXT_LINK = "font-medium underline underline-offset-4";

/**
 * The application on /affiliates. The page is static, so who's signed in
 * (and whether they already applied) is asked once it has loaded.
 */
export function ApplyForm() {
  const id = useId();
  const [state, setState] = useState<ApplyState | null>(null);
  const [website, setWebsite] = useState("");
  const [promotion, setPromotion] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    getAffiliateApplyState()
      .then((next) => {
        if (live) setState(next);
      })
      .catch(() => {
        if (live) setState({ signedIn: false, ready: true, status: null });
      });
    return () => {
      live = false;
    };
  }, []);

  if (!state) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner className="animate-spin" aria-hidden /> Loading…
      </div>
    );
  }

  if (!state.signedIn) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm text-pretty">
          Applications are tied to a QRdx account, so commissions and payouts
          have somewhere to live. Sign in or create a free account, then come
          back to this page.
        </p>
        <Button asChild>
          <Link href={signInPath("/affiliates")}>Sign in to apply</Link>
        </Button>
      </div>
    );
  }

  if (!state.ready) {
    return (
      <p className="text-muted-foreground text-sm">
        Applications aren't open yet. Please check back soon.
      </p>
    );
  }

  if (state.status) {
    const message = {
      pending:
        "Thanks, your application is in. We review each one by hand; the answer will show in Settings.",
      approved: "You're an approved affiliate. Your link is in Settings.",
      rejected: "Your application wasn't accepted.",
      suspended: "Your affiliate account is suspended.",
    }[state.status];
    return (
      <div className="space-y-3">
        <p className="text-sm text-pretty">{message}</p>
        {state.status !== "rejected" && (
          <Button asChild variant="outline">
            <Link href="/settings/affiliate">Open the affiliate dashboard</Link>
          </Button>
        )}
      </div>
    );
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await applyForAffiliateAction({
        website,
        promotion,
        agree: agree as true,
      });
      if (result.ok) {
        toast.success("Application sent");
        setState({ ...state, status: result.data.status });
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!isPending) submit();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-website`}>
          Website or profile{" "}
          <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          autoComplete="url"
          id={`${id}-website`}
          maxLength={200}
          onChange={(event) => setWebsite(event.target.value)}
          placeholder="Your site, newsletter or social profile"
          value={website}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-promotion`}>How will you share QRdx?</Label>
        <Textarea
          id={`${id}-promotion`}
          maxLength={1000}
          minLength={20}
          onChange={(event) => setPromotion(event.target.value)}
          placeholder="Who your audience is and where you'd mention QRdx"
          required
          rows={4}
          value={promotion}
        />
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          checked={agree}
          id={`${id}-agree`}
          onCheckedChange={(value) => setAgree(value === true)}
        />
        <Label
          className="text-sm leading-snug font-normal"
          htmlFor={`${id}-agree`}
        >
          I've read and accept the{" "}
          <Link className={TEXT_LINK} href="/legal/affiliate-terms">
            affiliate terms
          </Link>
          .
        </Label>
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <Button disabled={isPending || !agree} type="submit">
        {isPending && <Spinner className="animate-spin" aria-hidden />}
        Apply
      </Button>
    </form>
  );
}
