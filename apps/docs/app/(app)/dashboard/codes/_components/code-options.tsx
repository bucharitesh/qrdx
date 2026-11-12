"use client";

import { Tick } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { cn } from "@repo/design-system/lib/utils";
import {
  Calendar,
  ChemicalGlass,
  Code1,
  Hashtag,
  type Icon,
  Lock,
  MoneyRecive,
  PasswordCheck,
  Routing2,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type CodeOptionsData,
  getCodeOptions,
} from "@/app/(app)/dashboard/codes/_lib/code-option-actions";
import {
  CODE_OPTION_COPY,
  type CodeKind,
  type CodeOptionId,
  type CodeOptionPlans,
  codeOptionStatus,
  codeOptionsFor,
  formatPlanList,
} from "@/app/(app)/dashboard/codes/_lib/code-options";
import { LifecyclePanelForm } from "@/app/(app)/dashboard/codes/[id]/_components/lifecycle-panel-form";
import { PixelsPanel } from "@/app/(app)/dashboard/codes/[id]/_components/pixels-panel";
import type { MarketingSettingsPromise } from "@/app/(app)/dashboard/codes/[id]/_components/routing-panel";
import {
  PanelCard,
  PanelFallback,
  PlanLock,
  RoutingPanel,
} from "@/app/(app)/dashboard/codes/[id]/_components/routing-panel";
import { UtmPanel } from "@/app/(app)/dashboard/codes/[id]/_components/utm-panel";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { PLAN_NAMES } from "@/lib/pricing";

/** One icon per option; none repeats in the grid. */
export const OPTION_ICONS: Record<CodeOptionId, Icon> = {
  utm: Hashtag,
  routing: Routing2,
  ab: ChemicalGlass,
  password: PasswordCheck,
  schedule: Calendar,
  pixels: Code1,
  conversions: MoneyRecive,
};

type OptionStatus = Partial<Record<CodeOptionId, boolean>>;

function OptionBody({
  id,
  plans,
  on,
}: {
  id: CodeOptionId;
  plans: CodeOptionPlans | null;
  on: boolean;
}) {
  const t = useTranslations("app.dashboard.codes.codeOptions");
  const OptionIcon = OPTION_ICONS[id];
  const copy = CODE_OPTION_COPY[id];
  const access = plans?.options[id];
  return (
    <>
      <OptionIcon
        aria-hidden
        className="text-muted-foreground mt-0.5 size-4 shrink-0"
      />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-center gap-1 text-sm font-medium">
          {copy.label}
          {on && (
            <>
              <Tick className="text-foreground size-3.5 shrink-0" />
              <span className="sr-only">{t("on")}</span>
            </>
          )}
          <span className="ml-auto pl-1">
            {!plans ? (
              <Skeleton className="h-5 w-10 rounded-full" />
            ) : (
              access?.requiredPlan && (
                <Badge variant="outline">
                  {!access.included && <Lock aria-hidden />}
                  {PLAN_NAMES[access.requiredPlan]}
                  {!access.included && (
                    <span className="sr-only">{t("notOnYourPlan")}</span>
                  )}
                </Badge>
              )
            )}
          </span>
        </span>
        <span className="text-muted-foreground block text-xs leading-snug">
          {copy.blurb}
        </span>
      </span>
    </>
  );
}

const ITEM_CLASS =
  "hover:bg-muted/60 focus-visible:ring-ring/50 flex min-w-0 items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50";

/**
 * The power options of a dynamic code as buttons: what each does, the plan
 * that unlocks it and a tick once it's set up. Pass `onSelect` to open an
 * option in place, or `hrefs` to link to each one (server components can
 * only pass data, not functions).
 */
export function CodeOptionGrid({
  kind,
  plans,
  status = {},
  onSelect,
  hrefs,
  disabled,
  className,
}: {
  kind: CodeKind;
  /** null while loading */
  plans: CodeOptionPlans | null;
  status?: OptionStatus;
  onSelect?: (id: CodeOptionId) => void;
  hrefs?: Partial<Record<CodeOptionId, string>>;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <ul className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {codeOptionsFor(kind).map((id) => {
        const body = (
          <OptionBody id={id} on={Boolean(status[id])} plans={plans} />
        );
        const href = hrefs?.[id];
        return (
          <li className="min-w-0" key={id}>
            {href ? (
              <Link className={cn(ITEM_CLASS, "h-full")} href={href}>
                {body}
              </Link>
            ) : (
              <button
                className={cn(ITEM_CLASS, "h-full w-full")}
                disabled={disabled}
                onClick={() => onSelect?.(id)}
                type="button"
              >
                {body}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Above an option's panel: the plans that unlock it, whether this
 * workspace's plan does, and a link to compare plans.
 */
export function CodeOptionPlanNote({
  option,
  plans,
}: {
  option: CodeOptionId;
  plans: CodeOptionPlans;
}) {
  const t = useTranslations("app.dashboard.codes.codeOptions");
  const access = plans.options[option];
  if (!access.requiredPlan) return <>{t("includedInEveryPlan")}</>;
  return (
    <>
      {t.rich("availableOnPlansThisWorkspace", {
        plans: formatPlanList(access.plans),
        value: PLAN_NAMES[plans.plan],
        link: (chunks) => (
          <Link className="underline underline-offset-4" href="/pricing">
            {chunks}
          </Link>
        ),
      })}
    </>
  );
}

/**
 * The existing panel for an option (the same one the code page's Settings
 * tab shows), or an upgrade prompt when there is no code yet and the plan
 * doesn't include it.
 */
export function CodeOptionPanel({
  option,
  plans,
  marketing,
  lifecycle,
}: {
  option: CodeOptionId;
  plans: CodeOptionPlans;
  /** null: there is no code yet */
  marketing: MarketingSettingsPromise | null;
  lifecycle: CodeOptionsData["lifecycle"];
}) {
  const t = useTranslations("app.dashboard.codes.codeOptions");
  const access = plans.options[option];
  if (!marketing) {
    // No code yet: options on the plan create one first (see the code builder).
    return access.requiredPlan && !access.included ? (
      <PlanLock plan={access.requiredPlan}>
        {CODE_OPTION_COPY[option].summary}
      </PlanLock>
    ) : (
      <PanelFallback />
    );
  }
  switch (option) {
    case "utm":
      return <UtmPanel plan={access.requiredPlan} settings={marketing} />;
    case "routing":
      return <RoutingPanel plan={access.requiredPlan} settings={marketing} />;
    case "ab":
      return (
        <RoutingPanel
          plan={access.requiredPlan}
          settings={marketing}
          startWith="split"
        />
      );
    case "password":
    case "schedule":
      if (!lifecycle) return <PanelFallback />;
      return lifecycle.success ? (
        <LifecyclePanelForm
          initial={lifecycle.data}
          plan={access.requiredPlan}
        />
      ) : (
        <PanelCard
          description={lifecycle.error.message}
          title={t("accessSchedule")}
        >
          {null}
        </PanelCard>
      );
    case "pixels":
    case "conversions":
      return (
        <PixelsPanel
          plans={{
            pixels: plans.options.pixels.requiredPlan,
            conversions: plans.options.conversions.requiredPlan,
          }}
          settings={marketing}
        />
      );
  }
}

const PlansContext = createContext<CodeOptionPlans | null>(null);

/**
 * Server-rendered pages that know the workspace's plan pass the option plans
 * down, so the builder's buttons work without waiting for a round trip.
 */
export function CodeOptionPlansProvider({
  plans,
  children,
}: {
  plans: CodeOptionPlans;
  children: ReactNode;
}) {
  return (
    <PlansContext.Provider value={plans}>{children}</PlansContext.Provider>
  );
}

/**
 * The plans the page passed down (the app shell does on every dashboard and
 * settings page); null outside a provider, where copy leaves plan names out.
 */
export function useKnownCodeOptionPlans(): CodeOptionPlans | null {
  return useContext(PlansContext);
}

export interface CodeOptionsState {
  /** Which plans unlock each option; null while loading */
  plans: CodeOptionPlans | null;
  /** The loaded settings of the current code; null while loading */
  data: CodeOptionsData | null;
  /** The panels can render: plans are known and the code's settings loaded */
  ready: boolean;
  error: string | null;
  /** The settings promise the panels read; null without a code */
  marketing: MarketingSettingsPromise | null;
  status: OptionStatus;
  /** Load again, e.g. after a panel saved */
  reload: () => void;
}

/**
 * Loads the plans and, for an existing code, its option settings each time
 * the builder opens (and again on `reload`).
 */
export function useCodeOptions(
  open: boolean,
  codeId: string | null,
): CodeOptionsState {
  const known = useContext(PlansContext);
  // Tagged with the code it was loaded for, so a code created a moment ago
  // never shows the previous (no code) answer.
  const [loaded, setLoaded] = useState<{
    codeId: string | null;
    data: CodeOptionsData;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` forces a reload.
  useEffect(() => {
    // Nothing to load for a new code when the page already knows the plans.
    if (!open || (known && !codeId)) return;
    let cancelled = false;
    setError(null);
    getCodeOptions(codeId)
      .then((result) => {
        if (cancelled) return;
        if (result.success) setLoaded({ codeId, data: result.data });
        else setError(result.error.message);
      })
      .catch(() => {
        // Network failure: the action logs its own errors.
        if (!cancelled) setError("Couldn't load the options. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, codeId, known, version]);

  const data = loaded && loaded.codeId === codeId ? loaded.data : null;
  const plans = data?.plans ?? known;
  const ready = Boolean(plans) && (!codeId || Boolean(data));
  const marketing = useMemo(
    () => (data?.marketing ? Promise.resolve(data.marketing) : null),
    [data],
  );
  const status = useMemo(
    () =>
      codeOptionStatus(
        data?.marketing?.success ? data.marketing.data : null,
        data?.lifecycle?.success ? data.lifecycle.data : null,
      ),
    [data],
  );
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  return { plans, data, ready, error, marketing, status, reload };
}

/** "Options" heading, the grid, and a retry when loading failed. */
export function CodeOptionsField({
  kind,
  options,
  onSelect,
  creating,
  disabled,
}: {
  kind: CodeKind;
  options: CodeOptionsState;
  onSelect: (id: CodeOptionId) => void;
  /** The code doesn't exist yet: opening an option creates it first */
  creating?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("app.dashboard.codes.codeOptions");
  // Only options on the plan create the code; the others explain the plan.
  const createsCode =
    creating &&
    codeOptionsFor(kind).some((id) => options.plans?.options[id].included);
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{t("options")}</p>
        {createsCode && (
          <p className="text-muted-foreground text-xs">
            {t("openingOneCreatesTheCode")}
          </p>
        )}
      </div>
      {options.error ? (
        <div
          className="bg-destructive/10 text-destructive flex items-center justify-between gap-3 rounded-md p-3 text-sm"
          role="alert"
        >
          <span>{options.error}</span>
          <Button
            onClick={options.reload}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("tryAgain")}
          </Button>
        </div>
      ) : (
        <CodeOptionGrid
          disabled={disabled || !options.plans}
          kind={kind}
          onSelect={onSelect}
          plans={options.plans}
          status={options.status}
        />
      )}
    </div>
  );
}
