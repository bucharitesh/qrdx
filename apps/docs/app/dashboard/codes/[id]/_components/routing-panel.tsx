"use client";

import { toast } from "@repo/design-system";
import { Close as X } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { Switch } from "@repo/design-system/components/ui/switch";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  TickCircle as CheckCircle2,
  Forbidden as CircleSlash,
  ChemicalGlass as FlaskConical,
  Diamonds as Gem,
  Lock,
  Add as Plus,
  Trash as Trash2,
} from "iconsax-reactjs";
import Link from "next/link";
import {
  type ReactNode,
  Suspense,
  use,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  type CodeMarketingSettings,
  type MarketingActionResult,
  type RoutingTestResult,
  saveCodeRouting,
  testCodeRouting,
} from "@/actions/code-marketing";
import { InfoHint } from "@/components/help/info-hint";
import type { HintId } from "@/lib/help/hints";
import type {
  RoutingCondition,
  RoutingConfig,
  RoutingConfigInput,
} from "@/lib/redirect/routing";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";

// ─── Shared by the routing, UTM and pixels panels ───────────────────────────

export type MarketingSettingsPromise = Promise<
  MarketingActionResult<CodeMarketingSettings>
>;

const subscribeNothing = () => () => {};

/** False during SSR and hydration: panels use the browser's clock and time zone. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

export function PanelCard({
  title,
  description,
  badge,
  hint,
  children,
}: {
  title: string;
  description: ReactNode;
  badge?: "Pro" | "Business";
  /** Info (i) after the title; content lives in lib/help/hints.ts */
  hint?: HintId;
  children: ReactNode;
}) {
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{title}</CardTitle>
          {hint && <InfoHint align="start" className="-ml-0.5" id={hint} />}
          {badge && <Badge variant="outline">{badge}</Badge>}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4">{children}</CardContent>
    </Card>
  );
}

export function PanelFallback() {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="px-4">
        <Skeleton className="h-20 w-full" />
      </CardContent>
    </Card>
  );
}

/** Upgrade prompt: the feature stays visible, only editing is locked. */
export function PlanLock({
  plan,
  children,
}: {
  plan: "Pro" | "Business";
  children: ReactNode;
}) {
  const openUpgradeDialog = useGetProDialogStore((s) => s.openUpgradeDialog);
  return (
    <div className="bg-muted/50 flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground flex items-start gap-2 text-sm">
        <Lock className="mt-0.5 size-4 shrink-0" />
        <span>{children}</span>
      </p>
      <Button
        className="shrink-0"
        onClick={() => openUpgradeDialog(plan === "Pro" ? "pro" : "business")}
        size="sm"
      >
        <Gem />
        Upgrade to {plan}
      </Button>
    </div>
  );
}

export function PanelError({ message }: { message: string }) {
  return (
    <p className="text-destructive text-sm" role="alert">
      {message}
    </p>
  );
}

/** Reads the settings promise; renders `children` once loaded (client only). */
export function MarketingSettingsGate({
  settings,
  title,
  children,
}: {
  settings: MarketingSettingsPromise;
  title: string;
  children: (settings: CodeMarketingSettings) => ReactNode;
}) {
  const result = use(settings);
  const isClient = useIsClient();
  if (!result.success) {
    return (
      <PanelCard description={result.error.message} title={title}>
        {null}
      </PanelCard>
    );
  }
  if (!isClient) return <PanelFallback />;
  return children(result.data);
}

// ─── Draft model ─────────────────────────────────────────────────────────────

type ConditionType = RoutingCondition["type"];

interface DraftCondition {
  key: string;
  type: ConditionType;
  not: boolean;
  devices: string[];
  os: string[];
  /** Comma-separated countries, regions or languages */
  text: string;
  days: number[];
  start: string;
  end: string;
  timeZone: string;
  /** datetime-local values in the browser's time zone */
  from: string;
  to: string;
  operator: "first" | "after";
  count: string;
}

interface DraftVariant {
  id: string;
  name: string;
  url: string;
  weight: string;
}

interface DraftRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: DraftCondition[];
  mode: "redirect" | "split";
  url: string;
  variants: DraftVariant[];
  since: string | null;
}

const DEVICES = [
  { value: "mobile", label: "Phone" },
  { value: "tablet", label: "Tablet" },
  { value: "desktop", label: "Desktop" },
  { value: "other", label: "Other" },
] as const;

const OS_OPTIONS = [
  "iOS",
  "Android",
  "Windows",
  "macOS",
  "Linux",
  "ChromeOS",
  "HarmonyOS",
  "Windows Phone",
  "KaiOS",
] as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CONDITION_LABELS: Record<ConditionType, string> = {
  device: "Device",
  os: "Operating system",
  country: "Country",
  region: "Region",
  language: "Language",
  schedule: "Time of day",
  dates: "Date range",
  scans: "Scan count",
};

const CONDITION_TYPES = Object.keys(CONDITION_LABELS) as ConditionType[];

const MAX_RULES = 20;
const MAX_CONDITIONS = 8;
const MAX_VARIANTS = 5;

const randomId = () => Math.random().toString(36).slice(2, 10);
const browserTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const pad = (value: number) => String(value).padStart(2, "0");

function toLocalInput(value: string | Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const splitList = (text: string) =>
  text
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

function newCondition(type: ConditionType): DraftCondition {
  return {
    key: randomId(),
    type,
    not: false,
    devices: ["mobile"],
    os: ["iOS"],
    text: "",
    days: [1, 2, 3, 4, 5],
    start: "09:00",
    end: "17:00",
    timeZone: browserTimeZone(),
    from: "",
    to: "",
    operator: "first",
    count: "100",
  };
}

function newRule(overrides: Partial<DraftRule> = {}): DraftRule {
  return {
    id: randomId(),
    name: "",
    enabled: true,
    conditions: [],
    mode: "redirect",
    url: "",
    variants: [
      { id: "a", name: "A", url: "", weight: "50" },
      { id: "b", name: "B", url: "", weight: "50" },
    ],
    since: null,
    ...overrides,
  };
}

function conditionToDraft(condition: RoutingCondition): DraftCondition {
  const draft = {
    ...newCondition(condition.type),
    not: Boolean(condition.not),
  };
  switch (condition.type) {
    case "device":
      return { ...draft, devices: [...condition.devices] };
    case "os":
      return { ...draft, os: [...condition.os] };
    case "country":
      return { ...draft, text: condition.countries.join(", ") };
    case "region":
      return { ...draft, text: condition.regions.join(", ") };
    case "language":
      return { ...draft, text: condition.languages.join(", ") };
    case "schedule":
      return {
        ...draft,
        days: [...condition.days],
        start: condition.start,
        end: condition.end,
        timeZone: condition.timeZone,
      };
    case "dates":
      return {
        ...draft,
        from: toLocalInput(condition.from),
        to: toLocalInput(condition.to),
      };
    case "scans":
      return {
        ...draft,
        operator: condition.operator,
        count: String(condition.count),
      };
  }
}

function toDraft(config: RoutingConfig | null): DraftRule[] {
  return (config?.rules ?? []).map((rule) =>
    newRule({
      id: rule.id,
      name: rule.name ?? "",
      enabled: rule.enabled,
      conditions: rule.conditions.map(conditionToDraft),
      mode: rule.action.type,
      url: rule.action.type === "redirect" ? rule.action.url : "",
      variants:
        rule.action.type === "split"
          ? rule.action.variants.map((variant) => ({
              id: variant.id,
              name: variant.name ?? "",
              url: variant.url,
              weight: String(variant.weight),
            }))
          : newRule().variants,
      since: rule.action.type === "split" ? (rule.action.since ?? null) : null,
    }),
  );
}

type ConditionInput = RoutingConfigInput["rules"][number]["conditions"];

function conditionFromDraft(
  draft: DraftCondition,
): NonNullable<ConditionInput>[number] {
  const not = draft.not ? { not: true } : {};
  switch (draft.type) {
    case "device":
      return {
        type: "device",
        devices: draft.devices as ("mobile" | "tablet" | "desktop" | "other")[],
        ...not,
      };
    case "os":
      return {
        type: "os",
        os: draft.os as (typeof OS_OPTIONS)[number][],
        ...not,
      };
    case "country":
      return { type: "country", countries: splitList(draft.text), ...not };
    case "region":
      return { type: "region", regions: splitList(draft.text), ...not };
    case "language":
      return { type: "language", languages: splitList(draft.text), ...not };
    case "schedule":
      return {
        type: "schedule",
        days: [...draft.days].sort(),
        start: draft.start,
        end: draft.end,
        timeZone: draft.timeZone.trim(),
        ...not,
      };
    case "dates":
      return {
        type: "dates",
        from: fromLocalInput(draft.from),
        to: fromLocalInput(draft.to),
        ...not,
      };
    case "scans":
      return {
        type: "scans",
        operator: draft.operator,
        count: Number(draft.count),
        ...not,
      };
  }
}

function fromDraft(rules: DraftRule[]): RoutingConfigInput {
  return {
    version: 1,
    rules: rules.map((rule) => ({
      id: rule.id,
      name: rule.name.trim() || undefined,
      enabled: rule.enabled,
      conditions: rule.conditions.map(conditionFromDraft),
      action:
        rule.mode === "redirect"
          ? { type: "redirect", url: rule.url.trim() }
          : {
              type: "split",
              variants: rule.variants.map((variant) => ({
                id: variant.id,
                name: variant.name.trim() || undefined,
                url: variant.url.trim(),
                weight: Number(variant.weight),
              })),
            },
    })),
  };
}

const PRESETS: { label: string; rules: () => DraftRule[] }[] = [
  {
    label: "Smart app link (App Store / Google Play)",
    rules: () => [
      newRule({
        name: "iPhone & iPad → App Store",
        conditions: [{ ...newCondition("os"), os: ["iOS"] }],
        url: "https://apps.apple.com/app/",
      }),
      newRule({
        name: "Android → Google Play",
        conditions: [{ ...newCondition("os"), os: ["Android"] }],
        url: "https://play.google.com/store/apps/details?id=",
      }),
    ],
  },
  {
    label: "Country",
    rules: () => [
      newRule({ name: "By country", conditions: [newCondition("country")] }),
    ],
  },
  {
    label: "Visitor language",
    rules: () => [
      newRule({ name: "By language", conditions: [newCondition("language")] }),
    ],
  },
  {
    label: "Business hours",
    rules: () => [
      newRule({
        name: "Business hours",
        conditions: [newCondition("schedule")],
      }),
    ],
  },
  {
    label: "Date range (campaign)",
    rules: () => [
      newRule({ name: "Campaign dates", conditions: [newCondition("dates")] }),
    ],
  },
  {
    label: "First scans",
    rules: () => [
      newRule({ name: "First 100 scans", conditions: [newCondition("scans")] }),
    ],
  },
  {
    label: "A/B split",
    rules: () => [newRule({ name: "A/B test", mode: "split" })],
  },
  { label: "Empty rule", rules: () => [newRule()] },
];

// ─── Editors ─────────────────────────────────────────────────────────────────

function ToggleChips<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T[];
  onChange: (value: T[]) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons
    <div aria-label={label} className="flex flex-wrap gap-1" role="group">
      {options.map((option) => {
        const active = value.includes(option.value);
        return (
          <Button
            aria-pressed={active}
            disabled={disabled}
            key={String(option.value)}
            onClick={() =>
              onChange(
                active
                  ? value.filter((item) => item !== option.value)
                  : [...value, option.value],
              )
            }
            size="sm"
            type="button"
            variant={active ? "secondary" : "outline"}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function TimeZoneInput({
  value,
  onChange,
  disabled,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id: string;
}) {
  const [zones, setZones] = useState<string[]>([]);
  useEffect(() => {
    try {
      setZones(Intl.supportedValuesOf("timeZone"));
    } catch {
      setZones([]);
    }
  }, []);
  return (
    <>
      <Input
        aria-label="Time zone"
        className="h-8 w-52"
        disabled={disabled}
        id={id}
        list={`${id}-zones`}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      <datalist id={`${id}-zones`}>
        {zones.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
    </>
  );
}

const LIST_HINTS: Partial<Record<ConditionType, string>> = {
  country: "US, CA, GB",
  region: "US-CA, US-NY",
  language: "es, pt-BR",
};

function ConditionEditor({
  condition,
  onChange,
  onRemove,
  locked,
}: {
  condition: DraftCondition;
  onChange: (patch: Partial<DraftCondition>) => void;
  onRemove: () => void;
  locked: boolean;
}) {
  const id = useId();
  let editor: ReactNode;
  switch (condition.type) {
    case "device":
      editor = (
        <ToggleChips
          disabled={locked}
          label="Devices"
          onChange={(devices) => onChange({ devices })}
          options={DEVICES}
          value={condition.devices}
        />
      );
      break;
    case "os":
      editor = (
        <ToggleChips
          disabled={locked}
          label="Operating systems"
          onChange={(os) => onChange({ os })}
          options={OS_OPTIONS.map((os) => ({ value: os, label: os }))}
          value={condition.os}
        />
      );
      break;
    case "country":
    case "region":
    case "language":
      editor = (
        <Input
          aria-label={`${CONDITION_LABELS[condition.type]} codes`}
          className="h-8 max-w-sm"
          disabled={locked}
          onChange={(event) => onChange({ text: event.target.value })}
          placeholder={LIST_HINTS[condition.type]}
          value={condition.text}
        />
      );
      break;
    case "schedule":
      editor = (
        <div className="flex flex-wrap items-center gap-2">
          <ToggleChips
            disabled={locked}
            label="Days"
            onChange={(days) => onChange({ days })}
            options={WEEKDAYS.map((label, value) => ({ value, label }))}
            value={condition.days}
          />
          <Input
            aria-label="From"
            className="h-8 w-28"
            disabled={locked}
            onChange={(event) => onChange({ start: event.target.value })}
            type="time"
            value={condition.start}
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            aria-label="Until"
            className="h-8 w-28"
            disabled={locked}
            onChange={(event) => onChange({ end: event.target.value })}
            type="time"
            value={condition.end}
          />
          <TimeZoneInput
            disabled={locked}
            id={`${id}-tz`}
            onChange={(timeZone) => onChange({ timeZone })}
            value={condition.timeZone}
          />
        </div>
      );
      break;
    case "dates":
      editor = (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="From"
            className="h-8 w-56"
            disabled={locked}
            onChange={(event) => onChange({ from: event.target.value })}
            type="datetime-local"
            value={condition.from}
          />
          <span className="text-muted-foreground text-sm">until</span>
          <Input
            aria-label="Until"
            className="h-8 w-56"
            disabled={locked}
            onChange={(event) => onChange({ to: event.target.value })}
            type="datetime-local"
            value={condition.to}
          />
          <span className="text-muted-foreground text-xs">
            Your time zone; leave one side empty for open-ended
          </span>
        </div>
      );
      break;
    case "scans":
      editor = (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            disabled={locked}
            onValueChange={(operator) =>
              onChange({ operator: operator as DraftCondition["operator"] })
            }
            value={condition.operator}
          >
            <SelectTrigger
              aria-label="Which scans"
              className="h-8 w-36"
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first">The first</SelectItem>
              <SelectItem value="after">Every scan after</SelectItem>
            </SelectContent>
          </Select>
          <Input
            aria-label="Number of scans"
            className="h-8 w-28"
            disabled={locked}
            min={1}
            onChange={(event) => onChange({ count: event.target.value })}
            type="number"
            value={condition.count}
          />
          <span className="text-muted-foreground text-sm">scans</span>
        </div>
      );
      break;
  }

  return (
    <li className="bg-muted/40 flex flex-col gap-2 rounded-md p-2 sm:flex-row sm:items-start">
      <div className="flex shrink-0 items-center gap-2 sm:w-44 sm:pt-1.5">
        <span className="text-sm font-medium">
          {CONDITION_LABELS[condition.type]}
        </span>
        <Label className="text-muted-foreground flex items-center gap-1 text-xs font-normal">
          <Checkbox
            checked={condition.not}
            disabled={locked}
            onCheckedChange={(checked) => onChange({ not: checked === true })}
          />
          is not
        </Label>
      </div>
      <div className="min-w-0 flex-1">{editor}</div>
      <Button
        aria-label={`Remove ${CONDITION_LABELS[condition.type]} condition`}
        className="self-end sm:self-start"
        disabled={locked}
        onClick={onRemove}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <X />
      </Button>
    </li>
  );
}

function VariantsEditor({
  rule,
  onChange,
  locked,
}: {
  rule: DraftRule;
  onChange: (variants: DraftVariant[]) => void;
  locked: boolean;
}) {
  const total = rule.variants.reduce(
    (sum, variant) => sum + (Number(variant.weight) || 0),
    0,
  );
  const update = (index: number, patch: Partial<DraftVariant>) =>
    onChange(
      rule.variants.map((variant, i) =>
        i === index ? { ...variant, ...patch } : variant,
      ),
    );
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {rule.variants.map((variant, index) => (
          <li className="flex flex-wrap items-center gap-2" key={variant.id}>
            <Input
              aria-label="Variant name"
              className="h-8 w-20"
              disabled={locked}
              maxLength={40}
              onChange={(event) => update(index, { name: event.target.value })}
              placeholder={variant.id.toUpperCase()}
              value={variant.name}
            />
            <Input
              aria-label="Variant URL"
              className="h-8 min-w-48 flex-1"
              disabled={locked}
              inputMode="url"
              onChange={(event) => update(index, { url: event.target.value })}
              placeholder="https://example.com/variant"
              value={variant.url}
            />
            <Input
              aria-label="Weight"
              className="h-8 w-20"
              disabled={locked}
              max={100}
              min={1}
              onChange={(event) =>
                update(index, { weight: event.target.value })
              }
              type="number"
              value={variant.weight}
            />
            <span className="text-muted-foreground w-12 text-xs tabular-nums">
              {total > 0
                ? `${Math.round(((Number(variant.weight) || 0) / total) * 100)}%`
                : "—"}
            </span>
            <Button
              aria-label="Remove variant"
              disabled={locked || rule.variants.length <= 2}
              onClick={() =>
                onChange(rule.variants.filter((_, i) => i !== index))
              }
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          disabled={locked || rule.variants.length >= MAX_VARIANTS}
          onClick={() => {
            const used = new Set(rule.variants.map((variant) => variant.id));
            const id =
              "abcde".split("").find((letter) => !used.has(letter)) ??
              randomId();
            onChange([
              ...rule.variants,
              { id, name: id.toUpperCase(), url: "", weight: "50" },
            ]);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus />
          Add variant
        </Button>
        <p className="text-muted-foreground text-xs">
          Each visitor keeps their variant for the day.
          {rule.since &&
            ` Running since ${new Date(rule.since).toLocaleDateString()}.`}
        </p>
      </div>
    </div>
  );
}

function RuleCard({
  rule,
  index,
  count,
  locked,
  onChange,
  onMove,
  onRemove,
}: {
  rule: DraftRule;
  index: number;
  count: number;
  locked: boolean;
  onChange: (patch: Partial<DraftRule>) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const updateCondition = (key: string, patch: Partial<DraftCondition>) =>
    onChange({
      conditions: rule.conditions.map((condition) =>
        condition.key === key ? { ...condition, ...patch } : condition,
      ),
    });

  return (
    <li
      className={cn(
        "space-y-3 rounded-lg border p-3",
        !rule.enabled && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="tabular-nums" variant="secondary">
          {index + 1}
        </Badge>
        <Input
          aria-label="Rule name"
          className="h-8 min-w-40 flex-1"
          disabled={locked}
          maxLength={60}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder={`Rule ${index + 1}`}
          value={rule.name}
        />
        <Label
          className="flex items-center gap-2 text-sm font-normal"
          htmlFor={`${id}-on`}
        >
          <Switch
            checked={rule.enabled}
            disabled={locked && !rule.enabled}
            id={`${id}-on`}
            onCheckedChange={(enabled) => onChange({ enabled })}
          />
          {rule.enabled ? "On" : "Off"}
        </Label>
        <div className="flex">
          <Button
            aria-label="Move rule up"
            disabled={locked || index === 0}
            onClick={() => onMove(-1)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ArrowUp />
          </Button>
          <Button
            aria-label="Move rule down"
            disabled={locked || index === count - 1}
            onClick={() => onMove(1)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ArrowDown />
          </Button>
          <Button
            aria-label="Delete rule"
            onClick={onRemove}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-muted-foreground text-xs font-medium uppercase">
          {rule.conditions.length === 0
            ? "When: every scan"
            : "When all of these match"}
        </p>
        {rule.conditions.length > 0 && (
          <ul className="space-y-2">
            {rule.conditions.map((condition) => (
              <ConditionEditor
                condition={condition}
                key={condition.key}
                locked={locked}
                onChange={(patch) => updateCondition(condition.key, patch)}
                onRemove={() =>
                  onChange({
                    conditions: rule.conditions.filter(
                      (item) => item.key !== condition.key,
                    ),
                  })
                }
              />
            ))}
          </ul>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={locked || rule.conditions.length >= MAX_CONDITIONS}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus />
              Add condition
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {CONDITION_TYPES.map((type) => (
              <DropdownMenuItem
                key={type}
                onSelect={() =>
                  onChange({
                    conditions: [...rule.conditions, newCondition(type)],
                  })
                }
              >
                {CONDITION_LABELS[type]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground text-xs font-medium uppercase">
            Then
          </p>
          <Select
            disabled={locked}
            onValueChange={(mode) =>
              onChange({ mode: mode as DraftRule["mode"] })
            }
            value={rule.mode}
          >
            <SelectTrigger aria-label="Action" className="h-8 w-44" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="redirect">Send to a URL</SelectItem>
              <SelectItem value="split">Split between URLs (A/B)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {rule.mode === "redirect" ? (
          <Input
            aria-label="Destination URL"
            className="h-8"
            disabled={locked}
            inputMode="url"
            onChange={(event) => onChange({ url: event.target.value })}
            placeholder="https://example.com/page"
            value={rule.url}
          />
        ) : (
          <VariantsEditor
            locked={locked}
            onChange={(variants) => onChange({ variants })}
            rule={rule}
          />
        )}
      </div>
    </li>
  );
}

// ─── Rule tester ─────────────────────────────────────────────────────────────

function RuleTester({ codeId, rules }: { codeId: string; rules: DraftRule[] }) {
  const id = useId();
  const [sample, setSample] = useState({
    device: "mobile",
    os: "iOS",
    country: "US",
    region: "",
    language: "en-US",
    at: "",
    scanNumber: "1",
    visitor: "visitor-1",
  });
  const [result, setResult] = useState<RoutingTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSample((current) =>
      current.at ? current : { ...current, at: toLocalInput(new Date()) },
    );
  }, []);

  const set = (patch: Partial<typeof sample>) =>
    setSample((current) => ({ ...current, ...patch }));

  const run = () => {
    setError(null);
    startTransition(async () => {
      const response = await testCodeRouting({
        id: codeId,
        routing: rules.length > 0 ? fromDraft(rules) : null,
        sample: {
          device: sample.device as "mobile",
          os: sample.os === "unknown" ? null : (sample.os as "iOS"),
          country: sample.country,
          region: sample.region,
          language: sample.language,
          at: fromLocalInput(sample.at) ?? new Date().toISOString(),
          scanNumber: Number(sample.scanNumber) || 1,
          visitor: sample.visitor,
        },
      });
      if (response.success) {
        setResult(response.data);
      } else {
        setResult(null);
        setError(response.error.message);
      }
    });
  };

  const ruleLabel = (ruleId: string | null) => {
    const index = rules.findIndex((rule) => rule.id === ruleId);
    if (index === -1) return "No rule matched: default destination";
    return `Rule ${index + 1}${rules[index]?.name ? ` · ${rules[index]?.name}` : ""}`;
  };

  return (
    <details className="group rounded-lg border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium">
        <FlaskConical className="size-4" />
        Test your rules
        <span className="text-muted-foreground text-xs font-normal">
          (uses unsaved changes)
        </span>
      </summary>
      <div className="space-y-3 border-t p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor={`${id}-device`}>Device</Label>
            <Select
              onValueChange={(device) => set({ device })}
              value={sample.device}
            >
              <SelectTrigger className="w-full" id={`${id}-device`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEVICES.map((device) => (
                  <SelectItem key={device.value} value={device.value}>
                    {device.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-os`}>Operating system</Label>
            <Select onValueChange={(os) => set({ os })} value={sample.os}>
              <SelectTrigger className="w-full" id={`${id}-os`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OS_OPTIONS.map((os) => (
                  <SelectItem key={os} value={os}>
                    {os}
                  </SelectItem>
                ))}
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-country`}>Country</Label>
            <Input
              id={`${id}-country`}
              maxLength={2}
              onChange={(event) => set({ country: event.target.value })}
              placeholder="US"
              value={sample.country}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-region`}>Region</Label>
            <Input
              id={`${id}-region`}
              maxLength={6}
              onChange={(event) => set({ region: event.target.value })}
              placeholder="CA"
              value={sample.region}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-language`}>Language</Label>
            <Input
              id={`${id}-language`}
              maxLength={35}
              onChange={(event) => set({ language: event.target.value })}
              placeholder="en-US"
              value={sample.language}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-at`}>Date and time</Label>
            <Input
              id={`${id}-at`}
              onChange={(event) => set({ at: event.target.value })}
              type="datetime-local"
              value={sample.at}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-scan`}>Scan number</Label>
            <Input
              id={`${id}-scan`}
              min={1}
              onChange={(event) => set({ scanNumber: event.target.value })}
              type="number"
              value={sample.scanNumber}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-visitor`}>Visitor (for A/B)</Label>
            <Input
              id={`${id}-visitor`}
              maxLength={100}
              onChange={(event) => set({ visitor: event.target.value })}
              value={sample.visitor}
            />
          </div>
        </div>
        <Button disabled={isPending} onClick={run} size="sm" type="button">
          <FlaskConical />
          {isPending ? "Testing…" : "Run test"}
        </Button>
        {error && <PanelError message={error} />}
        {result && (
          <div
            className="bg-muted/50 space-y-2 rounded-md p-3 text-sm"
            aria-live="polite"
          >
            <p className="font-medium">
              {ruleLabel(result.ruleId)}
              {result.variantId &&
                ` · variant ${result.variantId.toUpperCase()}`}
            </p>
            <p className="font-mono text-xs break-all">{result.url}</p>
            {result.trace.length > 0 && (
              <ul className="text-muted-foreground space-y-1 text-xs">
                {result.trace.map((step, index) => (
                  <li className="flex items-center gap-1.5" key={step.ruleId}>
                    {step.matched ? (
                      <CheckCircle2 className="size-3.5 text-emerald-600" />
                    ) : (
                      <CircleSlash className="size-3.5" />
                    )}
                    Rule {index + 1}:{" "}
                    {!step.enabled
                      ? "off"
                      : step.matched
                        ? "matched"
                        : `no match (${step.conditions
                            .filter((condition) => !condition.matched)
                            .map(
                              (condition) => CONDITION_LABELS[condition.type],
                            )
                            .join(", ")})`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

function RoutingEditor({ initial }: { initial: CodeMarketingSettings }) {
  const [settings, setSettings] = useState(initial);
  const [rules, setRules] = useState(() => toDraft(initial.routing));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const locked = !settings.features.routing;
  const saved = JSON.stringify(fromDraft(toDraft(settings.routing)));
  const dirty = JSON.stringify(fromDraft(rules)) !== saved;

  const update = (index: number, patch: Partial<DraftRule>) =>
    setRules((current) =>
      current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    );

  const move = (index: number, offset: -1 | 1) =>
    setRules((current) => {
      const next = [...current];
      const target = index + offset;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [
        next[target] as DraftRule,
        next[index] as DraftRule,
      ];
      return next;
    });

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveCodeRouting({
        id: settings.codeId,
        routing: rules.length > 0 ? fromDraft(rules) : null,
      });
      if (result.success) {
        setSettings(result.data);
        setRules(toDraft(result.data.routing));
        toast.success("Routing rules saved");
      } else {
        setError(result.error.message);
      }
    });
  };

  // Hosted pages don't redirect, so there is nothing to route.
  if (settings.kind === "page") return null;

  return (
    <PanelCard
      badge="Pro"
      description={
        <>
          Send each scan to a different URL by device, country, language, time
          or scan count, or split traffic for A/B tests. Rules run top to
          bottom; the first match wins, otherwise scans go to the main
          destination.{" "}
          <Link className="underline" href="/docs/smart-routing">
            How it works
          </Link>
        </>
      }
      title="Smart routing"
    >
      {locked && (
        <PlanLock plan="Pro">
          {rules.length > 0
            ? "Your plan doesn't include smart routing. These rules keep working; you can turn them off or delete them, and editing them needs Pro."
            : "Smart routing (smart app links, country, language, time rules and A/B splits) is part of Pro."}
        </PlanLock>
      )}

      {rules.length > 0 && (
        <ol className="space-y-3">
          {rules.map((rule, index) => (
            <RuleCard
              count={rules.length}
              index={index}
              key={rule.id}
              locked={locked}
              onChange={(patch) => update(index, patch)}
              onMove={(offset) => move(index, offset)}
              onRemove={() =>
                setRules((current) => current.filter((_, i) => i !== index))
              }
              rule={rule}
            />
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={locked || rules.length >= MAX_RULES}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus />
              Add rule
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Start from</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PRESETS.map((preset) => (
              <DropdownMenuItem
                key={preset.label}
                onSelect={() =>
                  setRules((current) =>
                    [...current, ...preset.rules()].slice(0, MAX_RULES),
                  )
                }
              >
                {preset.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-2">
          {dirty && (
            <>
              <span className="text-muted-foreground text-xs">
                Unsaved changes
              </span>
              <Button
                disabled={isPending}
                onClick={() => {
                  setRules(toDraft(settings.routing));
                  setError(null);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Discard
              </Button>
            </>
          )}
          <Button
            disabled={isPending || !dirty}
            onClick={save}
            size="sm"
            type="button"
          >
            {isPending ? "Saving…" : "Save rules"}
          </Button>
        </div>
      </div>
      {error && <PanelError message={error} />}

      {rules.length > 0 && (
        <RuleTester codeId={settings.codeId} rules={rules} />
      )}
      <p className="text-muted-foreground text-xs">
        Country and region come from the scanner's IP address (never stored);
        language from their browser settings. UTM parameters are added after
        routing.
      </p>
    </PanelCard>
  );
}

/** Smart routing rules for a dynamic code (Pro). */
export function RoutingPanel({
  settings,
}: {
  settings: MarketingSettingsPromise;
}) {
  return (
    <Suspense fallback={<PanelFallback />}>
      <MarketingSettingsGate settings={settings} title="Smart routing">
        {(data) => <RoutingEditor initial={data} />}
      </MarketingSettingsGate>
    </Suspense>
  );
}
