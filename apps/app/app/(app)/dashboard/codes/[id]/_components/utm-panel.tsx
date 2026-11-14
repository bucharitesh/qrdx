"use client";

import { toast } from "@repo/design-system";
import { Close as X } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Add as Plus } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { Suspense, useId, useState, useTransition } from "react";
import {
  type CodeMarketingSettings,
  saveCodeUtm,
} from "@/actions/code-marketing";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { type PaidPlan, PLAN_NAMES } from "@/lib/pricing";
import type { UtmConfig } from "@/lib/redirect/routing";
import {
  MarketingSettingsGate,
  type MarketingSettingsPromise,
  PanelCard,
  PanelError,
  PanelFallback,
  PlanLock,
} from "./routing-panel";
import { UtmTemplatesMenu } from "./utm-templates";

const FIELDS = [
  { key: "source", param: "utm_source", placeholder: "qr" },
  { key: "medium", param: "utm_medium", placeholder: "print" },
  { key: "campaign", param: "utm_campaign", placeholder: "spring-sale" },
  { key: "term", param: "utm_term", placeholder: "" },
  { key: "content", param: "utm_content", placeholder: "poster-a" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

interface Draft {
  fields: Record<FieldKey, string>;
  params: { key: string; value: string; id: string }[];
}

const MAX_PARAMS = 10;
const randomId = () => Math.random().toString(36).slice(2, 10);

function toDraft(utm: UtmConfig | null): Draft {
  return {
    fields: {
      source: utm?.source ?? "",
      medium: utm?.medium ?? "",
      campaign: utm?.campaign ?? "",
      term: utm?.term ?? "",
      content: utm?.content ?? "",
    },
    params: (utm?.params ?? []).map((param) => ({ ...param, id: randomId() })),
  };
}

function fromDraft(draft: Draft) {
  return {
    ...Object.fromEntries(
      FIELDS.map(({ key }) => [key, draft.fields[key].trim() || undefined]),
    ),
    params: draft.params
      .filter((param) => param.key.trim() || param.value.trim())
      .map(({ key, value }) => ({ key: key.trim(), value: value.trim() })),
  };
}

/** The destination with the draft's parameters, as the redirect builds it. */
function previewUrl(destination: string, draft: Draft): string {
  try {
    const url = new URL(destination);
    const extra: string[] = [];
    const seen = new Set<string>();
    const add = (key: string, value: string) => {
      if (!(key && value) || seen.has(key) || url.searchParams.has(key)) return;
      seen.add(key);
      extra.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    };
    for (const field of FIELDS)
      add(field.param, draft.fields[field.key].trim());
    for (const param of draft.params) add(param.key.trim(), param.value.trim());
    if (extra.length === 0) return url.href;
    url.search = url.search
      ? `${url.search}&${extra.join("&")}`
      : `?${extra.join("&")}`;
    return url.href;
  } catch {
    return destination;
  }
}

function UtmEditor({
  initial,
  plan,
}: {
  initial: CodeMarketingSettings;
  plan: PaidPlan | null;
}) {
  const t = useTranslations("app.dashboard.codes.utmPanel");
  const id = useId();
  const [settings, setSettings] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial.utm));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const locked = !settings.features.utm;
  const dirty =
    JSON.stringify(fromDraft(draft)) !==
    JSON.stringify(fromDraft(toDraft(settings.utm)));

  const save = (next: Draft) => {
    setError(null);
    startTransition(async () => {
      const result = await saveCodeUtm({
        id: settings.codeId,
        utm: fromDraft(next),
      });
      if (result.success) {
        setSettings(result.data);
        setDraft(toDraft(result.data.utm));
        toast.success(t("utmParametersSaved"));
      } else {
        setError(result.error.message);
      }
    });
  };

  if (settings.kind === "page") return null;

  return (
    <PanelCard
      badge={plan}
      description={t.rich("tagEveryScanForGoogle", {
        link: (chunks) => (
          <Link className="underline" href="/docs/tracking-and-conversions">
            {chunks}
          </Link>
        ),
      })}
      hint="utm"
      title={t("utmParameters")}
    >
      {locked && plan && (
        <PlanLock plan={plan}>
          {settings.utm
            ? t("yourPlanDoesntIncludeUtm", { value: PLAN_NAMES[plan] })
            : t("automaticUtmTaggingIsPart", { value: PLAN_NAMES[plan] })}
        </PlanLock>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((field) => (
          <div className="space-y-1" key={field.key}>
            <Label className="font-mono text-xs" htmlFor={`${id}-${field.key}`}>
              {field.param}
            </Label>
            <Input
              disabled={locked}
              id={`${id}-${field.key}`}
              maxLength={200}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  fields: {
                    ...current.fields,
                    [field.key]: event.target.value,
                  },
                }))
              }
              placeholder={field.placeholder}
              value={draft.fields[field.key]}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("otherParameters")}</p>
        {draft.params.length > 0 && (
          <ul className="space-y-2">
            {draft.params.map((param) => (
              <li className="flex items-center gap-2" key={param.id}>
                <Input
                  aria-label={t("parameterName")}
                  className="h-8 w-40 font-mono text-xs"
                  disabled={locked}
                  maxLength={40}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      params: current.params.map((item) =>
                        item.id === param.id
                          ? { ...item, key: event.target.value }
                          : item,
                      ),
                    }))
                  }
                  placeholder={t("ref")}
                  value={param.key}
                />
                <Input
                  aria-label={t("parameterValue")}
                  className="h-8 flex-1"
                  disabled={locked}
                  maxLength={200}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      params: current.params.map((item) =>
                        item.id === param.id
                          ? { ...item, value: event.target.value }
                          : item,
                      ),
                    }))
                  }
                  placeholder={t("value")}
                  value={param.value}
                />
                <Button
                  aria-label={t("removeParameter")}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      params: current.params.filter(
                        (item) => item.id !== param.id,
                      ),
                    }))
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
        )}
        <Button
          disabled={locked || draft.params.length >= MAX_PARAMS}
          onClick={() =>
            setDraft((current) => ({
              ...current,
              params: [
                ...current.params,
                { key: "", value: "", id: randomId() },
              ],
            }))
          }
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus />
          {t("addParameter")}
        </Button>
      </div>

      <div className="bg-muted/50 space-y-1 rounded-md p-3">
        <p className="text-muted-foreground text-xs">
          {t("mainDestinationBecomes")}
        </p>
        <p className="font-mono text-xs break-all">
          {previewUrl(settings.destinationUrl, draft)}
        </p>
      </div>

      {error && <PanelError message={error} />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Saved templates: nothing renders while off (plan or server). */}
        <div>
          {!locked && (
            <UtmTemplatesMenu
              // Checked by the server when it's saved as a template.
              current={fromDraft(draft) as UtmConfig}
              disabled={isPending}
              onApply={(utm) => setDraft(toDraft(utm))}
            />
          )}
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {settings.utm && (
            <Button
              disabled={isPending}
              onClick={() => save(toDraft(null))}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("removeAll")}
            </Button>
          )}
          <Button
            disabled={isPending || !dirty || locked}
            onClick={() => save(draft)}
            size="sm"
            type="button"
          >
            {isPending ? t("saving") : t("saveParameters")}
          </Button>
        </div>
      </div>
    </PanelCard>
  );
}

/** UTM and custom query parameters appended on redirect. */
export function UtmPanel({
  settings,
  plan,
}: {
  settings: MarketingSettingsPromise;
  /** The cheapest plan with UTM parameters (lib/plans.ts) */
  plan: PaidPlan | null;
}) {
  const t = useTranslations("app.dashboard.codes.utmPanel");
  return (
    <Suspense fallback={<PanelFallback />}>
      <MarketingSettingsGate settings={settings} title={t("utmParameters")}>
        {(data) => <UtmEditor initial={data} plan={plan} />}
      </MarketingSettingsGate>
    </Suspense>
  );
}
