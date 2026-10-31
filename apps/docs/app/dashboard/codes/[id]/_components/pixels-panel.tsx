"use client";

import { toast } from "@repo/design-system";
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
import { Switch } from "@repo/design-system/components/ui/switch";
import Link from "next/link";
import { Suspense, useId, useState, useTransition } from "react";
import {
  type CodeMarketingSettings,
  saveCodePixels,
} from "@/actions/code-marketing";
import { CopyButton } from "@/components/copy-button";
import type { PixelConfig, PixelProvider } from "@/lib/redirect/routing";
import {
  MarketingSettingsGate,
  type MarketingSettingsPromise,
  PanelCard,
  PanelError,
  PanelFallback,
  PlanLock,
} from "./routing-panel";

const PROVIDERS: { key: PixelProvider; label: string; placeholder: string }[] =
  [
    {
      key: "ga4",
      label: "Google Analytics 4 measurement ID",
      placeholder: "G-XXXXXXXXXX",
    },
    {
      key: "gtm",
      label: "Google Tag Manager container ID",
      placeholder: "GTM-XXXXXXX",
    },
    {
      key: "meta",
      label: "Meta (Facebook) pixel ID",
      placeholder: "123456789012345",
    },
    {
      key: "tiktok",
      label: "TikTok pixel ID",
      placeholder: "CXXXXXXXXXXXXXXXXXXX",
    },
    {
      key: "linkedin",
      label: "LinkedIn Insight Tag partner ID",
      placeholder: "1234567",
    },
  ];

type Draft = Record<PixelProvider, string> & {
  consent: "auto" | "always";
  conversions: boolean;
};

function toDraft(pixels: PixelConfig | null): Draft {
  return {
    ga4: pixels?.ga4 ?? "",
    gtm: pixels?.gtm ?? "",
    meta: pixels?.meta ?? "",
    tiktok: pixels?.tiktok ?? "",
    linkedin: pixels?.linkedin ?? "",
    consent: pixels?.consent ?? "auto",
    conversions: pixels?.conversions ?? false,
  };
}

const fromDraft = (draft: Draft) => ({
  ga4: draft.ga4.trim().toUpperCase() || undefined,
  gtm: draft.gtm.trim().toUpperCase() || undefined,
  meta: draft.meta.trim() || undefined,
  tiktok: draft.tiktok.trim().toUpperCase() || undefined,
  linkedin: draft.linkedin.trim() || undefined,
  consent: draft.consent,
  conversions: draft.conversions,
});

function Snippet({ code, label }: { code: string; label: string }) {
  return (
    <div className="relative">
      <pre className="bg-muted max-h-64 overflow-auto rounded-md p-3 pr-10 font-mono text-xs leading-relaxed">
        {code}
      </pre>
      <CopyButton
        aria-label={`Copy ${label.toLowerCase()}`}
        className="absolute top-2 right-2"
        textToCopy={code}
      />
    </div>
  );
}

function ConversionsSection({
  settings,
  draft,
  setDraft,
}: {
  settings: CodeMarketingSettings;
  draft: Draft;
  setDraft: (patch: Partial<Draft>) => void;
}) {
  const id = useId();
  const locked = !settings.features.conversions;
  const browserSnippet = `<script async src="${settings.origin}/conversions.js"></script>
<script>
  window.qrdx = window.qrdx || function () {
    (window.qrdx.q = window.qrdx.q || []).push(arguments);
  };
  // Where the conversion happens, e.g. your order confirmation page:
  qrdx("conversion", { name: "purchase", value: 49.99, currency: "USD", id: "ORDER-1234" });
</script>`;
  const serverSnippet = `curl -X POST ${settings.origin}/api/v1/conversions \\
  -H "Authorization: Bearer $QRDX_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"sid": "<qrdx_sid>", "name": "purchase", "value": 49.99, "currency": "USD", "id": "ORDER-1234"}'`;

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium">Conversion tracking (Business)</p>
          <p className="text-muted-foreground text-sm">
            Adds a signed <code className="font-mono text-xs">qrdx_sid</code> to
            the URL each scan opens. Your site reports sales or sign-ups with
            it, and QRdx attributes them to the scan (up to 30 days later).
          </p>
        </div>
        <Label
          className="flex items-center gap-2 text-sm font-normal"
          htmlFor={`${id}-on`}
        >
          <Switch
            checked={draft.conversions}
            disabled={locked && !draft.conversions}
            id={`${id}-on`}
            onCheckedChange={(conversions) => setDraft({ conversions })}
          />
          {draft.conversions ? "On" : "Off"}
        </Label>
      </div>
      {locked && !settings.pixels?.conversions && (
        <PlanLock plan="Business">
          Conversion tracking and revenue attribution are part of Business.
        </PlanLock>
      )}
      {draft.conversions && (
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">
            1. Add this to the pages people land on and where they convert. It
            remembers <code className="font-mono">qrdx_sid</code> in a
            first-party cookie for 30 days.
          </p>
          <Snippet code={browserSnippet} label="Browser snippet" />
          <p className="text-muted-foreground text-xs">
            2. Or report from your server with an API token (scope{" "}
            <code className="font-mono">codes:write</code>):
          </p>
          <Snippet code={serverSnippet} label="Server example" />
        </div>
      )}
    </div>
  );
}

function PixelsEditor({ initial }: { initial: CodeMarketingSettings }) {
  const id = useId();
  const [settings, setSettings] = useState(initial);
  const [draft, setDraftState] = useState(() => toDraft(initial.pixels));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isPage = settings.kind === "page";
  const locked = !settings.features.pixels;
  const dirty =
    JSON.stringify(fromDraft(draft)) !==
    JSON.stringify(fromDraft(toDraft(settings.pixels)));
  const setDraft = (patch: Partial<Draft>) =>
    setDraftState((current) => ({ ...current, ...patch }));

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveCodePixels({
        id: settings.codeId,
        pixels: fromDraft(draft),
      });
      if (result.success) {
        setSettings(result.data);
        setDraftState(toDraft(result.data.pixels));
        toast.success("Tracking settings saved");
      } else {
        setError(result.error.message);
      }
    });
  };

  return (
    <PanelCard
      badge={isPage ? "Pro" : "Business"}
      description={
        <>
          {isPage
            ? "Load your own analytics and retargeting pixels on this code's hosted page. Visitors are asked for consent first where the law requires it."
            : "This code opens your website directly, so add your pixels there. Here you can turn on conversion tracking to attribute sales to scans."}{" "}
          <Link className="underline" href="/docs/tracking-and-conversions">
            Learn more
          </Link>
        </>
      }
      title={isPage ? "Tracking pixels" : "Conversion tracking"}
    >
      {isPage && (
        <>
          {locked && (
            <PlanLock plan="Pro">
              {PROVIDERS.some((provider) => settings.pixels?.[provider.key])
                ? "Your plan doesn't include tracking pixels. The saved ones keep loading; you can remove them, and adding new ones needs Pro."
                : "Tracking pixels (Google Analytics, Tag Manager, Meta, TikTok, LinkedIn) are part of Pro."}
            </PlanLock>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {PROVIDERS.map((provider) => (
              <div className="space-y-1" key={provider.key}>
                <Label htmlFor={`${id}-${provider.key}`}>
                  {provider.label}
                </Label>
                <Input
                  autoComplete="off"
                  disabled={locked && !draft[provider.key]}
                  id={`${id}-${provider.key}`}
                  maxLength={30}
                  onChange={(event) =>
                    setDraft({
                      [provider.key]: event.target.value,
                    } as Partial<Draft>)
                  }
                  placeholder={provider.placeholder}
                  spellCheck={false}
                  value={draft[provider.key]}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-consent`}>Cookie consent banner</Label>
            <Select
              onValueChange={(consent) =>
                setDraft({ consent: consent as Draft["consent"] })
              }
              value={draft.consent}
            >
              <SelectTrigger className="w-full sm:w-96" id={`${id}-consent`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  Where required (EU, EEA, UK, Switzerland, unknown location)
                </SelectItem>
                <SelectItem value="always">For every visitor</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Pixels never load before a visitor accepts the banner. Elsewhere
              (setting "Where required") they load right away.
            </p>
          </div>
        </>
      )}

      {!isPage && (
        <ConversionsSection
          draft={draft}
          setDraft={setDraft}
          settings={settings}
        />
      )}

      {error && <PanelError message={error} />}
      <div className="flex justify-end gap-2">
        {dirty && (
          <Button
            disabled={isPending}
            onClick={() => setDraftState(toDraft(settings.pixels))}
            size="sm"
            type="button"
            variant="ghost"
          >
            Discard
          </Button>
        )}
        <Button
          disabled={isPending || !dirty}
          onClick={save}
          size="sm"
          type="button"
        >
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </PanelCard>
  );
}

/** Owner pixels for hosted pages (Pro) and conversion tracking (Business). */
export function PixelsPanel({
  settings,
}: {
  settings: MarketingSettingsPromise;
}) {
  return (
    <Suspense fallback={<PanelFallback />}>
      <MarketingSettingsGate settings={settings} title="Tracking">
        {(data) => <PixelsEditor initial={data} />}
      </MarketingSettingsGate>
    </Suspense>
  );
}
