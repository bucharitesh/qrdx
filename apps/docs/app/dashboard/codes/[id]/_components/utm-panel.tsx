"use client";

import { toast } from "@repo/design-system";
import { Close as X } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Add as Plus } from "iconsax-reactjs";
import Link from "next/link";
import { Suspense, useId, useState, useTransition } from "react";
import {
  type CodeMarketingSettings,
  saveCodeUtm,
} from "@/actions/code-marketing";
import type { UtmConfig } from "@/lib/redirect/routing";
import {
  MarketingSettingsGate,
  type MarketingSettingsPromise,
  PanelCard,
  PanelError,
  PanelFallback,
  PlanLock,
} from "./routing-panel";

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

function UtmEditor({ initial }: { initial: CodeMarketingSettings }) {
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
        toast.success("UTM parameters saved");
      } else {
        setError(result.error.message);
      }
    });
  };

  if (settings.kind === "page") return null;

  return (
    <PanelCard
      badge="Pro"
      description={
        <>
          Tag every scan for Google Analytics and other tools. Parameters are
          added to the URL each scan opens (after smart routing) unless the URL
          already has them.{" "}
          <Link className="underline" href="/docs/tracking-and-conversions">
            Learn more
          </Link>
        </>
      }
      hint="utm"
      title="UTM parameters"
    >
      {locked && (
        <PlanLock plan="Pro">
          {settings.utm
            ? "Your plan doesn't include UTM parameters. The saved ones keep being added; you can remove them, and changing them needs Pro."
            : "Automatic UTM tagging is part of Pro."}
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
        <p className="text-sm font-medium">Other parameters</p>
        {draft.params.length > 0 && (
          <ul className="space-y-2">
            {draft.params.map((param) => (
              <li className="flex items-center gap-2" key={param.id}>
                <Input
                  aria-label="Parameter name"
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
                  placeholder="ref"
                  value={param.key}
                />
                <Input
                  aria-label="Parameter value"
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
                  placeholder="value"
                  value={param.value}
                />
                <Button
                  aria-label="Remove parameter"
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
          Add parameter
        </Button>
      </div>

      <div className="bg-muted/50 space-y-1 rounded-md p-3">
        <p className="text-muted-foreground text-xs">
          Main destination becomes
        </p>
        <p className="font-mono text-xs break-all">
          {previewUrl(settings.destinationUrl, draft)}
        </p>
      </div>

      {error && <PanelError message={error} />}
      <div className="flex flex-wrap justify-end gap-2">
        {settings.utm && (
          <Button
            disabled={isPending}
            onClick={() => save(toDraft(null))}
            size="sm"
            type="button"
            variant="ghost"
          >
            Remove all
          </Button>
        )}
        <Button
          disabled={isPending || !dirty || locked}
          onClick={() => save(draft)}
          size="sm"
          type="button"
        >
          {isPending ? "Saving…" : "Save parameters"}
        </Button>
      </div>
    </PanelCard>
  );
}

/** UTM and custom query parameters appended on redirect (Pro). */
export function UtmPanel({ settings }: { settings: MarketingSettingsPromise }) {
  return (
    <Suspense fallback={<PanelFallback />}>
      <MarketingSettingsGate settings={settings} title="UTM parameters">
        {(data) => <UtmEditor initial={data} />}
      </MarketingSettingsGate>
    </Suspense>
  );
}
