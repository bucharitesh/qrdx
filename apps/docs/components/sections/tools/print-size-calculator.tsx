"use client";

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
import { useState } from "react";
import { InfoHint } from "@/components/help/info-hint";
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

const UNITS: { value: DistanceUnit; label: string }[] = [
  { value: "cm", label: "centimeters" },
  { value: "m", label: "meters" },
  { value: "in", label: "inches" },
  { value: "ft", label: "feet" },
];

const ECC_LABELS: Record<EccLevel, string> = {
  L: "L, recovers ~7%",
  M: "M, recovers ~15%",
  Q: "Q, recovers ~25% (QRdx default)",
  H: "H, recovers ~30%",
};

const MODE_LABELS = {
  numeric: "numeric",
  alphanumeric: "alphanumeric",
  byte: "byte",
} as const;

/** Rounds up so the printed size is never below the minimum. */
function formatLength(mm: number): string {
  const roundedMm = mm < 100 ? Math.ceil(mm * 10) / 10 : Math.ceil(mm);
  const inches = mmToInches(mm);
  const roundedIn = Math.ceil(inches * 100) / 100;
  return `${roundedMm.toLocaleString()} mm (${roundedIn.toLocaleString()} in)`;
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
  const length = getEncodedLength(content, mode);
  const parsedVersion = Number.parseInt(versionInput, 10);

  let version: number | null = null;
  let versionError: string | null = null;
  if (source === "content") {
    if (!content) versionError = "Enter the content your code will hold.";
    else {
      version = getMinVersion(content, ecc);
      if (version === null) {
        versionError = `Too much data for one QR code at level ${ecc}: the limit is ${getCapacity(MAX_VERSION, ecc, mode).toLocaleString()} ${mode === "byte" ? "bytes" : "characters"}.`;
      }
    }
  } else if (
    Number.isInteger(parsedVersion) &&
    parsedVersion >= MIN_VERSION &&
    parsedVersion <= MAX_VERSION
  ) {
    version = parsedVersion;
  } else {
    versionError = "Enter a version from 1 to 40.";
  }

  const modules = version ? modulesForVersion(version) : null;
  const result =
    distanceMm && modules ? calculatePrintSize({ distanceMm, modules }) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="scan-distance">Scanning distance</Label>
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
              <SelectTrigger className="w-36" aria-label="Distance unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            The furthest distance someone will scan from: about 20–30 cm for a
            table card, 1–2 m for a poster, more for signs.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="ecc-level">Error correction</Label>
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
                  {ECC_LABELS[level]}
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
            <TabsTrigger value="content">From content</TabsTrigger>
            <TabsTrigger value="version">From QR version</TabsTrigger>
          </TabsList>
          <TabsContent value="content" className="flex flex-col gap-1.5 pt-2">
            <Label htmlFor="qr-content">Content of the code</Label>
            <Textarea
              id="qr-content"
              rows={3}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {content
                ? `${length.toLocaleString()} ${mode === "byte" ? "bytes" : "characters"} in ${MODE_LABELS[mode]} mode.`
                : "Paste the exact text, link or payload the code will contain."}
            </p>
          </TabsContent>
          <TabsContent value="version" className="flex flex-col gap-1.5 pt-2">
            <Label htmlFor="qr-version">QR version (1–40)</Label>
            <Input
              id="qr-version"
              inputMode="numeric"
              max={MAX_VERSION}
              min={MIN_VERSION}
              type="number"
              value={versionInput}
              onChange={(event) => setVersionInput(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Version n has 17 + 4n modules per side: version 1 is 21 × 21,
              version 40 is 177 × 177.
            </p>
          </TabsContent>
        </Tabs>
      </div>

      <div
        aria-live="polite"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
      >
        <h2 className="font-medium">Minimum printed size</h2>
        {!distanceMm && (
          <p className="text-sm text-destructive">
            Enter a scanning distance greater than zero.
          </p>
        )}
        {versionError && (
          <p className="text-sm text-destructive">{versionError}</p>
        )}
        {result && version && modules && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Result
                label="Code size (edge to edge)"
                value={formatLength(result.symbolMm)}
                hint={`Version ${version}, ${modules} × ${modules} modules`}
              />
              <Result
                label={`With ${QUIET_ZONE_MODULES}-module quiet zone`}
                value={formatLength(result.totalMm)}
                hint="The blank margin scanners need around the code"
              />
              <Result
                label="Module (single square) size"
                value={`${(Math.ceil(result.moduleMm * 100) / 100).toLocaleString()} mm`}
                hint={
                  result.limitedBy === "minimum-module"
                    ? `Raised to the ${MIN_MODULE_MM} mm minimum for reliable printing`
                    : "Set by the scanning distance"
                }
              />
              <Result
                label="Export at 300 DPI"
                value={`${pixelsForPrint(result.totalMm).toLocaleString()} px`}
                hint="Minimum image width including the quiet zone"
              />
            </div>
            {source === "content" && (
              <p className="text-xs text-muted-foreground">
                At level {ecc}, version {version} holds up to{" "}
                {getCapacity(version, ecc, mode).toLocaleString()}{" "}
                {mode === "byte" ? "bytes" : "characters"} in{" "}
                {MODE_LABELS[mode]} mode.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              For comparison, the plain distance ÷ 10 rule gives{" "}
              {formatLength(result.ruleOfThumbMm)}. Print above the minimum for
              curved surfaces, low contrast, glossy material or poor lighting.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
