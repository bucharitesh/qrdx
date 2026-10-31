"use client";

import { toast } from "@repo/design-system";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { Lock, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState, useTransition } from "react";
import {
  type CodeLifecycleView,
  setCodePaused,
  updateCodeLifecycle,
} from "@/actions/code-lifecycle";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";

type UpdateInput = Parameters<typeof updateCodeLifecycle>[0];

const STATUS_BADGES: Record<
  CodeLifecycleView["status"],
  { label: string; variant: "secondary" | "outline" }
> = {
  live: { label: "Live", variant: "secondary" },
  paused: { label: "Paused", variant: "outline" },
  "not-started": { label: "Scheduled", variant: "outline" },
  expired: { label: "Ended", variant: "outline" },
  "scan-limit": { label: "Scan limit reached", variant: "outline" },
};

const pad = (value: number) => String(value).padStart(2, "0");

/** ISO → value for <input type="datetime-local"> in the browser's time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** datetime-local value → ISO; null when empty, undefined when invalid. */
function fromLocalInput(value: string): string | null | undefined {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Local date and time once mounted (UTC on the server, so hydration matches). */
function When({ iso }: { iso: string }) {
  const [text, setText] = useState(
    () => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`,
  );
  useEffect(() => setText(dateFormat.format(new Date(iso))), [iso]);
  return <time dateTime={iso}>{text}</time>;
}

function statusSummary(view: CodeLifecycleView) {
  switch (view.status) {
    case "paused":
      return "Paused: scans go to your fallback URL or a neutral page.";
    case "not-started":
      return view.startsAt ? (
        <>
          Starts <When iso={view.startsAt} />. Until then scans show a "not
          active yet" page.
        </>
      ) : null;
    case "expired":
      return view.expiresAt ? (
        <>
          Ended <When iso={view.expiresAt} />.
        </>
      ) : null;
    case "scan-limit":
      return `Reached its limit of ${view.scanLimit?.toLocaleString("en-US")} scans.`;
    default:
      return view.hasPassword
        ? "Live and password protected."
        : "Live: every scan goes through.";
  }
}

export function LifecyclePanelForm({
  initial,
}: {
  initial: CodeLifecycleView;
}) {
  const router = useRouter();
  const openGetProDialog = useGetProDialogStore((s) => s.openGetProDialog);
  const [view, setView] = useState(initial);
  const [password, setPassword] = useState("");
  const [removePassword, setRemovePassword] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [scanLimit, setScanLimit] = useState(
    initial.scanLimit?.toString() ?? "",
  );
  const [fallbackUrl, setFallbackUrl] = useState(initial.fallbackUrl ?? "");
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isPausing, startPausing] = useTransition();

  // Dates are shown in the browser's time zone, so they're filled in after mount.
  useEffect(() => {
    setStartsAt(toLocalInput(view.startsAt));
    setExpiresAt(toLocalInput(view.expiresAt));
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, [view.startsAt, view.expiresAt]);

  const locked = !view.canUseControls;
  const hasProSettings = Boolean(
    view.hasPassword ||
      view.startsAt ||
      view.expiresAt ||
      view.scanLimit ||
      view.fallbackUrl,
  );

  const apply = (next: CodeLifecycleView) => {
    setView(next);
    setPassword("");
    setRemovePassword(false);
    setScanLimit(next.scanLimit?.toString() ?? "");
    setFallbackUrl(next.fallbackUrl ?? "");
    router.refresh();
  };

  /** Only the fields that changed; a string is a validation message. */
  const buildPatch = (): Omit<UpdateInput, "id"> | string => {
    const patch: Omit<UpdateInput, "id"> = {};
    if (removePassword) patch.password = null;
    else if (password) patch.password = password;

    for (const [key, value, current] of [
      ["startsAt", startsAt, view.startsAt],
      ["expiresAt", expiresAt, view.expiresAt],
    ] as const) {
      if (value === toLocalInput(current)) continue;
      const iso = fromLocalInput(value);
      if (iso === undefined) return "Enter a valid date and time";
      patch[key] = iso;
    }

    const limit = scanLimit.trim();
    const nextLimit = limit ? Number(limit) : null;
    if (nextLimit !== null && !(Number.isInteger(nextLimit) && nextLimit > 0)) {
      return "The scan limit must be a whole number above 0";
    }
    if (nextLimit !== view.scanLimit) patch.scanLimit = nextLimit;

    const fallback = fallbackUrl.trim() || null;
    if (fallback !== view.fallbackUrl) patch.fallbackUrl = fallback;
    return patch;
  };

  const patch = buildPatch();
  const hasChanges = typeof patch === "string" || Object.keys(patch).length > 0;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typeof patch === "string") {
      toast.error(patch);
      return;
    }
    startSaving(async () => {
      const result = await updateCodeLifecycle({ id: view.id, ...patch });
      if (!result.success) {
        if (result.error.code === "PLAN_REQUIRED") openGetProDialog();
        toast.error(result.error.message);
        return;
      }
      apply(result.data);
      toast.success(
        result.data.heldForReview
          ? "Saved. The code is held for review because of its fallback URL."
          : "Settings saved",
      );
    });
  };

  const onPausedChange = (paused: boolean) => {
    startPausing(async () => {
      const result = await setCodePaused({ id: view.id, paused });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      apply(result.data);
      toast.success(paused ? "Code paused" : "Code resumed");
    });
  };

  const badge = STATUS_BADGES[view.status];

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Access &amp; schedule</CardTitle>
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {view.hasPassword && (
            <Badge variant="outline">
              <Lock />
              Password
            </Badge>
          )}
        </div>
        <CardDescription>{statusSummary(view)}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 px-4">
        {view.disabled && (
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>
              {view.heldForReview ? "Held for review" : "Turned off by QRdx"}
            </AlertTitle>
            <AlertDescription>
              {view.heldForReview
                ? "Our automated checks flagged a link on this code (for example a URL shortener, an IP address or a lookalike domain), so it stays off until a reviewer approves it, usually within a day. Nothing else is needed from you."
                : "This code was switched off after an abuse review and doesn't redirect. Contact support@qrdx.dev if you think this is a mistake."}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="lifecycle-paused">Pause code</Label>
            <p className="text-muted-foreground text-sm">
              While paused, scans go to your fallback URL, or to a neutral "this
              campaign is paused" page. Available on every plan.
            </p>
          </div>
          <Switch
            checked={Boolean(view.pausedAt)}
            disabled={isPausing}
            id="lifecycle-paused"
            onCheckedChange={onPausedChange}
          />
        </div>

        {locked && (
          <div className="bg-muted/50 flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>
              Passwords, start and end dates, scan limits and fallback URLs are
              part of Pro.
              {hasProSettings &&
                " Your current settings keep working, and you can remove them any time."}
            </p>
            <Button onClick={openGetProDialog} size="sm" type="button">
              Upgrade
            </Button>
          </div>
        )}

        <form className="space-y-6" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="lifecycle-password">Password</Label>
            {view.hasPassword && !removePassword ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  autoComplete="new-password"
                  disabled={locked}
                  id="lifecycle-password"
                  maxLength={64}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter a new password to change it"
                  type="password"
                  value={password}
                />
                <Button
                  onClick={() => {
                    setPassword("");
                    setRemovePassword(true);
                  }}
                  type="button"
                  variant="outline"
                >
                  Remove password
                </Button>
              </div>
            ) : (
              <Input
                autoComplete="new-password"
                disabled={locked}
                id="lifecycle-password"
                maxLength={64}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  removePassword
                    ? "The password will be removed when you save"
                    : "No password"
                }
                type="password"
                value={password}
              />
            )}
            <p className="text-muted-foreground text-xs">
              Visitors type it once; that browser stays unlocked for 6 hours. At
              least 4 characters.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["starts", "Starts", startsAt, setStartsAt],
                ["ends", "Ends", expiresAt, setExpiresAt],
              ] as const
            ).map(([key, label, value, setValue]) => (
              <div className="space-y-2" key={key}>
                <Label htmlFor={`lifecycle-${key}`}>{label}</Label>
                <div className="flex gap-2">
                  <Input
                    disabled={locked}
                    id={`lifecycle-${key}`}
                    onChange={(event) => setValue(event.target.value)}
                    type="datetime-local"
                    value={value}
                  />
                  {value && (
                    <Button
                      onClick={() => setValue("")}
                      type="button"
                      variant="outline"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground -mt-4 text-xs">
            Before the start, scans show a "not active yet" page; after the end,
            they go to the fallback URL.
            {timeZone && ` Times are in your time zone (${timeZone}).`}
          </p>

          <div className="space-y-2">
            <Label htmlFor="lifecycle-scan-limit">Scan limit</Label>
            <div className="flex gap-2">
              <Input
                disabled={locked}
                id="lifecycle-scan-limit"
                inputMode="numeric"
                min={1}
                onChange={(event) => setScanLimit(event.target.value)}
                placeholder="No limit"
                type="number"
                value={scanLimit}
              />
              {scanLimit && (
                <Button
                  onClick={() => setScanLimit("")}
                  type="button"
                  variant="outline"
                >
                  Clear
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Counts scans the way your analytics do (bots excluded). This code
              has {view.scanCount.toLocaleString("en-US")} so far.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lifecycle-fallback">Fallback URL</Label>
            <div className="flex gap-2">
              <Input
                disabled={locked}
                id="lifecycle-fallback"
                inputMode="url"
                maxLength={2048}
                onChange={(event) => setFallbackUrl(event.target.value)}
                placeholder="https://"
                type="url"
                value={fallbackUrl}
              />
              {fallbackUrl && (
                <Button
                  onClick={() => setFallbackUrl("")}
                  type="button"
                  variant="outline"
                >
                  Clear
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Where scans go while the code is paused, after it ends or once it
              reaches its scan limit. Without one, visitors see a neutral page,
              never an ad or a QRdx page.
            </p>
          </div>

          <div className="flex justify-end">
            <Button disabled={!hasChanges || isSaving} type="submit">
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
