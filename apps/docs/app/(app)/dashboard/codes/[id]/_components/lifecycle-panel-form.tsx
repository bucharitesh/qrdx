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
import { Lock, ShieldCross as ShieldAlert } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState, useTransition } from "react";
import {
  type CodeLifecycleView,
  setCodePaused,
  updateCodeLifecycle,
} from "@/actions/code-lifecycle";
import type { Translator } from "@/lib/i18n/translator";
import { type PaidPlan, PLAN_NAMES } from "@/lib/pricing";
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

function statusSummary(
  view: CodeLifecycleView,
  t: Translator<"app.dashboard.codes.lifecyclePanelForm">,
) {
  switch (view.status) {
    case "paused":
      return t("pausedScansGoToYour");
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
      return t("reachedItsLimitOfValue", {
        value: view.scanLimit?.toLocaleString("en-US") ?? "",
      });
    default:
      return view.hasPassword
        ? t("liveAndPasswordProtected")
        : t("liveEveryScanGoesThrough");
  }
}

export function LifecyclePanelForm({
  initial,
  plan,
}: {
  initial: CodeLifecycleView;
  /** The cheapest plan with password, dates and scan limits (lib/plans.ts) */
  plan: PaidPlan | null;
}) {
  const t = useTranslations("app.dashboard.codes.lifecyclePanelForm");
  const router = useRouter();
  const openUpgradeDialog = useGetProDialogStore((s) => s.openUpgradeDialog);
  const upgrade = () => openUpgradeDialog(plan ?? "pro");
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
        if (result.error.code === "PLAN_REQUIRED") upgrade();
        toast.error(result.error.message);
        return;
      }
      apply(result.data);
      toast.success(
        result.data.heldForReview
          ? t("savedTheCodeIsHeld")
          : t("settingsSaved"),
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
      toast.success(paused ? t("codePaused") : t("codeResumed"));
    });
  };

  const badge = STATUS_BADGES[view.status];

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{t("accessSchedule")}</CardTitle>
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {view.hasPassword && (
            <Badge variant="outline">
              <Lock />
              {t("password")}
            </Badge>
          )}
        </div>
        <CardDescription>{statusSummary(view, t)}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 px-4">
        {view.disabled && (
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>
              {view.heldForReview ? t("heldForReview") : t("turnedOffByQrdx")}
            </AlertTitle>
            <AlertDescription>
              {view.heldForReview
                ? t("ourAutomatedChecksFlaggedA")
                : t("thisCodeWasSwitchedOff")}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="lifecycle-paused">{t("pauseCode")}</Label>
            <p className="text-muted-foreground text-sm">
              {t("whilePausedScansGoTo")}
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
              {t("passwordsStartAndEndDates")}{" "}
              {plan ? PLAN_NAMES[plan] : t("aPaidPlan")}.
              {hasProSettings && t("yourCurrentSettingsKeepWorking")}
            </p>
            <Button onClick={upgrade} size="sm" type="button">
              {t("upgrade")}
            </Button>
          </div>
        )}

        <form className="space-y-6" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="lifecycle-password">{t("password")}</Label>
            {view.hasPassword && !removePassword ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  autoComplete="new-password"
                  disabled={locked}
                  id="lifecycle-password"
                  maxLength={64}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t("enterANewPasswordTo")}
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
                  {t("removePassword")}
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
                    ? t("thePasswordWillBeRemoved")
                    : t("noPassword")
                }
                type="password"
                value={password}
              />
            )}
            <p className="text-muted-foreground text-xs">
              {t("visitorsTypeItOnceThat")}
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
                      {t("clear")}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground -mt-4 text-xs">
            {t("beforeTheStartScansShow")}
            {timeZone && t("timesAreInYourTime", { timeZone })}
          </p>

          <div className="space-y-2">
            <Label htmlFor="lifecycle-scan-limit">{t("scanLimit")}</Label>
            <div className="flex gap-2">
              <Input
                disabled={locked}
                id="lifecycle-scan-limit"
                inputMode="numeric"
                min={1}
                onChange={(event) => setScanLimit(event.target.value)}
                placeholder={t("noLimit")}
                type="number"
                value={scanLimit}
              />
              {scanLimit && (
                <Button
                  onClick={() => setScanLimit("")}
                  type="button"
                  variant="outline"
                >
                  {t("clear")}
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {t("countsScansTheWayYour", {
                value: view.scanCount.toLocaleString("en-US"),
              })}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lifecycle-fallback">{t("fallbackUrl")}</Label>
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
                  {t("clear")}
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {t("whereScansGoWhileThe")}
            </p>
          </div>

          <div className="flex justify-end">
            <Button disabled={!hasChanges || isSaving} type="submit">
              {isSaving ? t("saving") : t("saveChanges")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
