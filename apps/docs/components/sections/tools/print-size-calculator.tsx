"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { Printer } from "iconsax-reactjs";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { InfoHint } from "@/components/help/info-hint";
import {
  formatPrintDistance,
  parsePrintDistance,
  playgroundHref,
} from "@/lib/playground-links";
import {
  calculatePrintSize,
  type DistanceUnit,
  detectMode,
  ECC_LEVELS,
  type EccLevel,
  getCapacity,
  getEncodedLength,
  getMinVersion,
  MAX_VERSION,
  MIN_MODULE_MM,
  MIN_VERSION,
  mmToInches,
  modulesForVersion,
  pixelsForPrint,
  QUIET_ZONE_MODULES,
  toMillimeters,
} from "@/lib/print-size";

// Labels are in the catalog (tools.printSize.calculator): units.<unit>,
// ecc.<level>, modes.<mode>.
const UNITS: DistanceUnit[] = ["cm", "m", "in", "ft"];

/** Rounds up so the printed size is never below the minimum. */
function formatLength(mm: number, locale: string): string {
  const roundedMm = mm < 100 ? Math.ceil(mm * 10) / 10 : Math.ceil(mm);
  const inches = mmToInches(mm);
  const roundedIn = Math.ceil(inches * 100) / 100;
  return `${roundedMm.toLocaleString(locale)} mm (${roundedIn.toLocaleString(locale)} in)`;
}

function Result({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-background p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tracking-tight">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function PrintSizeCalculator() {
  const t = useTranslations("tools.printSize.calculator");
  const locale = useLocale();
  const length = (mm: number) => formatLength(mm, locale);
  const [distance, setDistance] = useState("1");
  const [unit, setUnit] = useState<DistanceUnit>("m");
  const [source, setSource] = useState<"content" | "version">("content");
  const [content, setContent] = useState("https://qrdx.dev");
  const [versionInput, setVersionInput] = useState("3");
  const [ecc, setEcc] = useState<EccLevel>("Q");

  const distanceValue = Number.parseFloat(distance);
  const distanceMm =
    Number.isFinite(distanceValue) && distanceValue > 0
      ? toMillimeters(distanceValue, unit)
      : null;

  const mode = detectMode(content);
  const encodedLength = getEncodedLength(content, mode);
  const parsedVersion = Number.parseInt(versionInput, 10);

  let version: number | null = null;
  let versionError: string | null = null;
  if (source === "content") {
    if (!content) versionError = t("errorNoContent");
    else {
      version = getMinVersion(content, ecc);
      if (version === null) {
        versionError = t("errorTooMuch", {
          ecc,
          limit: getCapacity(MAX_VERSION, ecc, mode),
          bytes: mode === "byte" ? "yes" : "no",
        });
      }
    }
  } else if (
    Number.isInteger(parsedVersion) &&
    parsedVersion >= MIN_VERSION &&
    parsedVersion <= MAX_VERSION
  ) {
    version = parsedVersion;
  } else {
    versionError = t("errorVersion");
  }

  const modules = version ? modulesForVersion(version) : null;
  const result =
    distanceMm && modules ? calculatePrintSize({ distanceMm, modules }) : null;
  // The playground gets the distance, not a width: only its Print-ready tab
  // knows the real code's modules and quiet zone, and sizes it from them.
  // Outside the distances that tab can produce, there's no link.
  const linkDistance = result
    ? parsePrintDistance(
        formatPrintDistance({
          value: Number(distanceValue.toFixed(3)),
          unit,
        }),
      )
    : null;
  const playgroundPrintHref = linkDistance
    ? playgroundHref({ open: "print", printDistance: linkDistance })
    : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="scan-distance">{t("distance")}</Label>
            <InfoHint align="start" id="print-size" />
          </div>
          <div className="flex gap-2">
            <Input
              id="scan-distance"
              inputMode="decimal"
              min={0}
              step="any"
              type="number"
              value={distance}
              onChange={(event) => setDistance(event.target.value)}
              className="flex-1"
            />
            <Select
              value={unit}
              onValueChange={(value) => setUnit(value as DistanceUnit)}
            >
              <SelectTrigger className="w-36" aria-label={t("unit")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(`units.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">{t("distanceHelp")}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="ecc-level">{t("ecc")}</Label>
            <InfoHint align="start" id="error-correction" />
          </div>
          <Select
            value={ecc}
            onValueChange={(value) => setEcc(value as EccLevel)}
          >
            <SelectTrigger id="ecc-level" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ECC_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {t(`eccLevels.${level}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs
          value={source}
          onValueChange={(value) => setSource(value as "content" | "version")}
        >
          <TabsList className="w-full">
            <TabsTrigger value="content">{t("fromContent")}</TabsTrigger>
            <TabsTrigger value="version">{t("fromVersion")}</TabsTrigger>
          </TabsList>
          <TabsContent value="content" className="flex flex-col gap-1.5 pt-2">
            <Label htmlFor="qr-content">{t("content")}</Label>
            <Textarea
              id="qr-content"
              rows={3}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {content
                ? t("contentLength", {
                    count: encodedLength,
                    bytes: mode === "byte" ? "yes" : "no",
                    mode: t(`modes.${mode}`),
                  })
                : t("contentHelp")}
            </p>
          </TabsContent>
          <TabsContent value="version" className="flex flex-col gap-1.5 pt-2">
            <Label htmlFor="qr-version">{t("version")}</Label>
            <Input
              id="qr-version"
              inputMode="numeric"
              max={MAX_VERSION}
              min={MIN_VERSION}
              type="number"
              value={versionInput}
              onChange={(event) => setVersionInput(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("versionHelp")}</p>
          </TabsContent>
        </Tabs>
      </div>

      <div
        aria-live="polite"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
      >
        <h2 className="font-medium">{t("resultTitle")}</h2>
        {!distanceMm && (
          <p className="text-sm text-destructive">{t("errorDistance")}</p>
        )}
        {versionError && (
          <p className="text-sm text-destructive">{versionError}</p>
        )}
        {result && version && modules && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Result
                label={t("codeSize")}
                value={length(result.symbolMm)}
                hint={t("codeSizeHint", { version, modules })}
              />
              <Result
                label={t("withQuietZone", { modules: QUIET_ZONE_MODULES })}
                value={length(result.totalMm)}
                hint={t("withQuietZoneHint")}
              />
              <Result
                label={t("moduleSize")}
                value={`${(Math.ceil(result.moduleMm * 100) / 100).toLocaleString(locale)} mm`}
                hint={
                  result.limitedBy === "minimum-module"
                    ? t("moduleRaised", { mm: MIN_MODULE_MM })
                    : t("moduleByDistance")
                }
              />
              <Result
                label={t("export")}
                value={`${pixelsForPrint(result.totalMm).toLocaleString(locale)} px`}
                hint={t("exportHint")}
              />
            </div>
            {source === "content" && (
              <p className="text-xs text-muted-foreground">
                {t("capacity", {
                  ecc,
                  version,
                  count: getCapacity(version, ecc, mode),
                  bytes: mode === "byte" ? "yes" : "no",
                  mode: t(`modes.${mode}`),
                })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("ruleOfThumb", { size: length(result.ruleOfThumbMm) })}
            </p>
            {playgroundPrintHref && (
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-3">
                <Button asChild size="sm" variant="outline">
                  <Link href={playgroundPrintHref}>
                    <Printer aria-hidden className="size-4" />
                    {t("makeCode")}
                  </Link>
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t("makeCodeHint", {
                    distance: `${linkDistance?.value} ${linkDistance?.unit}`,
                  })}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
