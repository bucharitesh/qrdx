"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { CheckCircle2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { ABUSE_REASONS } from "@/lib/safety/abuse-reasons";
import { type ReportFormState, submitAbuseReport } from "./actions";
import { TurnstileWidget } from "./turnstile-widget";

const initialState: ReportFormState = { status: "idle" };

export function ReportForm({
  defaultUrl,
  turnstileSiteKey,
}: {
  defaultUrl: string;
  turnstileSiteKey: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    submitAbuseReport,
    initialState,
  );
  const [submissions, setSubmissions] = useState(0);
  // Controlled, so React's automatic form reset doesn't wipe them on an error.
  const [url, setUrl] = useState(defaultUrl);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");

  // Turnstile tokens are single-use: get a fresh one after every attempt.
  useEffect(() => {
    if (state.status !== "idle") setSubmissions((count) => count + 1);
  }, [state]);

  if (state.status === "success") {
    return (
      <div
        aria-live="polite"
        className="bg-card flex flex-col items-center gap-3 rounded-xl border p-8 text-center"
      >
        <CheckCircle2 className="size-8 text-green-600" />
        <h2 className="text-xl font-semibold">Thanks, we got your report</h2>
        <p className="text-muted-foreground max-w-md text-sm">
          We review reports within 24–48 hours. If the code breaks our terms we
          switch it off, and if you left your email we'll let you know what we
          did.
        </p>
      </div>
    );
  }

  const error = state.status === "error" ? state : null;
  const describedBy = (name: "url" | "reason" | "email") =>
    error?.field === name ? "report-error" : undefined;

  return (
    <form
      action={formAction}
      className="bg-card space-y-5 rounded-xl border p-6"
    >
      <div className="space-y-2">
        <Label htmlFor="report-url">QR code link</Label>
        <Input
          aria-describedby={describedBy("url")}
          aria-invalid={error?.field === "url" || undefined}
          id="report-url"
          maxLength={2048}
          name="url"
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://qrdx.dev/q/aB3dE5f"
          required
          value={url}
        />
        <p className="text-muted-foreground text-xs">
          The link the QR code opened (scan it with your camera and copy the
          link), or the address of the page it led to.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="report-reason">What's wrong?</Label>
        <select
          aria-describedby={describedBy("reason")}
          aria-invalid={error?.field === "reason" || undefined}
          className="border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
          id="report-reason"
          name="reason"
          onChange={(event) => setReason(event.target.value)}
          required
          value={reason}
        >
          <option disabled value="">
            Choose a reason
          </option>
          {ABUSE_REASONS.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="report-details">Details (optional)</Label>
        <Textarea
          id="report-details"
          maxLength={2000}
          name="details"
          onChange={(event) => setDetails(event.target.value)}
          placeholder="Where did you find the code, and what happened when you opened it?"
          rows={4}
          value={details}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="report-email">Your email (optional)</Label>
        <Input
          aria-describedby={describedBy("email")}
          aria-invalid={error?.field === "email" || undefined}
          autoComplete="email"
          id="report-email"
          maxLength={254}
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          type="email"
          value={email}
        />
        <p className="text-muted-foreground text-xs">
          Only used to follow up on this report.
        </p>
      </div>

      {turnstileSiteKey && (
        <TurnstileWidget resetKey={submissions} siteKey={turnstileSiteKey} />
      )}

      {error && (
        <p className="text-destructive text-sm" id="report-error" role="alert">
          {error.message}
        </p>
      )}

      <Button className="w-full sm:w-auto" disabled={isPending} type="submit">
        {isPending ? "Sending…" : "Send report"}
      </Button>
    </form>
  );
}
