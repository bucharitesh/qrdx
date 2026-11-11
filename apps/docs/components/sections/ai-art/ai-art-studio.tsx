"use client";

import { toast } from "@repo/design-system";
import { Bot, Close } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { Switch } from "@repo/design-system/components/ui/switch";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import { ArrowRight, GalleryAdd, Lock } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { SignInLink } from "@/components/auth/sign-in-link";
import { LocaleLink } from "@/components/i18n/locale-link";
import { ART_MODEL_LABEL, ART_SUPPORTS_SEED } from "@/lib/ai/art-models";
import { playgroundHref } from "@/lib/playground-links";
import { AIArtComingSoon } from "./ai-art-coming-soon";
import { AIArtPresetGallery } from "./ai-art-preset-gallery";
import { AIArtResultPanel } from "./ai-art-result";
import {
  createAIArtRunStore,
  lockedSeedFor,
  seedIsInvalid,
} from "./ai-art-run";
import {
  type AIArtCredits,
  type AIArtRequest,
  ART_CREATIVITY,
  ART_MAX_VARIATIONS,
  ART_NEGATIVE_PROMPT_MAX_LENGTH,
  ART_PROMPT_MAX_LENGTH,
  ART_PROMPT_MIN_LENGTH,
  ART_QR_VISIBILITY,
  ART_TEXT_MAX_LENGTH,
  seedsForRun,
} from "./config";
import type { AIArtPreset } from "./presets";
import {
  AI_ART_REFERENCE_TYPES,
  readReferenceFile,
  useAIArtRun,
} from "./use-ai-art-run";

export interface AIArtAllowances {
  free: number | null;
  pro: number | null;
  business: number | null;
}

interface AIArtStudioProps {
  /** Server-side AI_GATEWAY_API_KEY check; a 503 from the API flips it off too. */
  configured: boolean;
  /** Monthly images per plan, from lib/plans (null = unlimited). */
  allowances: AIArtAllowances;
}

export function AIArtStudio({ configured, allowances }: AIArtStudioProps) {
  const t = useTranslations("aiArt.aiArtStudio");
  const [store] = useState(() => createAIArtRunStore(configured));
  const art = useAIArtRun({ store });
  const [text, setText] = useState("");
  const [prompt, setPrompt] = useState("");
  // The style preset the prompt came from, until the prompt is edited.
  const [preset, setPreset] = useState<AIArtPreset | null>(null);
  const presetId = preset?.id ?? null;
  const [negativePrompt, setNegativePrompt] = useState("");
  const [visibility, setVisibility] = useState<number>(
    ART_QR_VISIBILITY.default,
  );
  const [creativity, setCreativity] = useState<number>(ART_CREATIVITY.default);
  const [variations, setVariations] = useState(2);
  const [seed, setSeed] = useState("");
  const [seedLocked, setSeedLocked] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const { credits, isGenerating, pendingVariations, run: result } = art;

  if (!art.configured) {
    return <AIArtComingSoon />;
  }

  // A model that ignores seeds gets random ones: they only tell variations apart.
  const lockedSeed = lockedSeedFor(seed, seedLocked, ART_SUPPORTS_SEED);
  const seedInvalid = seedIsInvalid(seed, seedLocked, ART_SUPPORTS_SEED);
  const notEnoughCredits = art.lacksCredits(variations);
  const canSubmit =
    text.trim().length > 0 &&
    prompt.trim().length >= ART_PROMPT_MIN_LENGTH &&
    !seedInvalid &&
    !isGenerating;
  const meta = { preset: presetId, lockedSeed: lockedSeed !== undefined };

  const currentRequest = (): AIArtRequest => ({
    text: text.trim(),
    prompt: prompt.trim(),
    ...(negativePrompt.trim() && { negativePrompt: negativePrompt.trim() }),
    visibility,
    creativity,
    ...(reference && { reference }),
  });

  const handleReference = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const prepared = await readReferenceFile(file);
    if (prepared) setReference(prepared);
  };

  return (
    <div className="grid w-full gap-10 md:grid-cols-2">
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) {
            art.generate(
              currentRequest(),
              seedsForRun(variations, lockedSeed),
              meta,
            );
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="ai-art-text">{t("linkOrText")}</Label>
          <Input
            autoComplete="off"
            disabled={isGenerating}
            id="ai-art-text"
            maxLength={ART_TEXT_MAX_LENGTH}
            onChange={(event) => setText(event.target.value)}
            placeholder="https://example.com"
            spellCheck={false}
            value={text}
          />
          <p className="text-muted-foreground text-xs">
            {t("shorterContentMeansFewerLarger")}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="ai-art-prompt">{t("style")}</Label>
            <span className="text-muted-foreground text-xs tabular-nums">
              {prompt.length}/{ART_PROMPT_MAX_LENGTH}
            </span>
          </div>
          <AIArtPresetGallery
            activePresetId={presetId}
            disabled={isGenerating}
            onSelect={(picked) => {
              setPreset(picked);
              setPrompt(picked.prompt);
              setNegativePrompt(picked.negativePrompt ?? "");
            }}
          />
          <Textarea
            disabled={isGenerating}
            id="ai-art-prompt"
            maxLength={ART_PROMPT_MAX_LENGTH}
            onChange={(event) => {
              setPrompt(event.target.value);
              if (preset && preset.prompt !== event.target.value) {
                setPreset(null);
              }
            }}
            placeholder={t("describeASceneEG")}
            rows={3}
            value={prompt}
          />
        </div>

        <SliderField
          description={[t("moreArtistic"), t("clearerCode")]}
          disabled={isGenerating}
          id="ai-art-visibility"
          label={t("qrVisibility")}
          onChange={setVisibility}
          range={ART_QR_VISIBILITY}
          value={visibility}
        />
        <SliderField
          description={[t("followsYourPrompt"), t("interpretsFreely")]}
          disabled={isGenerating}
          id="ai-art-creativity"
          label={t("creativity")}
          onChange={setCreativity}
          range={ART_CREATIVITY}
          value={creativity}
        />

        <div className="flex flex-col gap-2">
          <Label id="ai-art-variations-label">{t("variations")}</Label>
          <ToggleGroup
            aria-labelledby="ai-art-variations-label"
            disabled={isGenerating}
            onValueChange={(value) => value && setVariations(Number(value))}
            type="single"
            value={String(variations)}
            variant="outline"
          >
            {Array.from({ length: ART_MAX_VARIATIONS }, (_, index) => (
              <ToggleGroupItem
                className="w-12"
                key={index}
                value={String(index + 1)}
              >
                {index + 1}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-muted-foreground text-xs">
            {t("eachVariationIsItsOwn")}
          </p>
        </div>

        <details className="group rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {ART_SUPPORTS_SEED
              ? t("advancedNegativePromptSeedReference")
              : t("advancedNegativePromptReferenceImage")}
          </summary>
          <div className="mt-4 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ai-art-negative">{t("negativePrompt")}</Label>
              <Textarea
                disabled={isGenerating}
                id="ai-art-negative"
                maxLength={ART_NEGATIVE_PROMPT_MAX_LENGTH}
                onChange={(event) => setNegativePrompt(event.target.value)}
                placeholder={t("thingsToAvoidEG")}
                rows={2}
                value={negativePrompt}
              />
              <p className="text-muted-foreground text-xs">
                {t("theModelIsAskedTo")}
              </p>
            </div>

            {ART_SUPPORTS_SEED && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="ai-art-seed">{t("seed")}</Label>
                  <div className="flex items-center gap-2">
                    <Label
                      className="text-muted-foreground text-xs"
                      htmlFor="ai-art-seed-lock"
                    >
                      {t("lockSeed")}
                    </Label>
                    <Switch
                      checked={seedLocked}
                      disabled={isGenerating}
                      id="ai-art-seed-lock"
                      onCheckedChange={setSeedLocked}
                    />
                  </div>
                </div>
                <Input
                  aria-invalid={seedInvalid || undefined}
                  disabled={isGenerating || !seedLocked}
                  id="ai-art-seed"
                  inputMode="numeric"
                  onChange={(event) =>
                    setSeed(event.target.value.replace(/[^\d]/g, ""))
                  }
                  placeholder={seedLocked ? "e.g. 42" : t("randomEachRun")}
                  value={seed}
                />
                <p className="text-muted-foreground text-xs">
                  {t("theSameSeedAndSettings")}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label>{t("referenceImage")}</Label>
              <input
                accept={AI_ART_REFERENCE_TYPES.join(",")}
                aria-label={t("uploadAReferenceImage")}
                className="sr-only"
                onChange={handleReference}
                ref={referenceInputRef}
                type="file"
              />
              {reference ? (
                <div className="flex items-center gap-3">
                  <img
                    alt={t("reference")}
                    className="size-16 rounded border object-cover"
                    src={reference}
                  />
                  <Button
                    disabled={isGenerating}
                    onClick={() => setReference(null)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Close />
                    {t("remove")}
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-fit"
                  disabled={isGenerating}
                  onClick={() => referenceInputRef.current?.click()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <GalleryAdd />
                  {t("uploadReference")}
                </Button>
              )}
              <p className="text-muted-foreground text-xs">
                {t("optionalALogoPhotoOr", { ART_MODEL_LABEL })}
              </p>
            </div>
          </div>
        </details>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={!canSubmit || notEnoughCredits}
              type="submit"
            >
              {isGenerating ? <Spinner /> : <Bot />}
              {isGenerating
                ? t("generating")
                : t("generateVariations", { count: variations })}
            </Button>
            {isGenerating && (
              <Button onClick={art.cancel} type="button" variant="outline">
                <Close />
                {t("cancel")}
              </Button>
            )}
          </div>
          <CreditsNote
            allowances={allowances}
            credits={credits}
            signedIn={art.signedIn}
            variations={variations}
          />
        </div>

        <div className="bg-muted/50 flex items-start gap-3 rounded-lg border p-3 text-sm">
          <Lock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <p className="text-muted-foreground">
            {t.rich("aiArtCodesAreStatic", {
              span: (chunks) => (
                <span className="text-foreground font-medium">{chunks}</span>
              ),
              signInLink: (chunks) => (
                <SignInLink
                  className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
                  href="/dashboard"
                >
                  {chunks}
                </SignInLink>
              ),
            })}
          </p>
        </div>

        <p className="text-muted-foreground -mt-2 text-sm text-pretty">
          {t("alreadyDesigningACode")}{" "}
          <LocaleLink
            className="text-foreground inline-flex items-center gap-1 font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
            href={playgroundHref({
              tab: "art",
              art: "ai",
              artStyle: presetId ?? undefined,
            })}
          >
            {t("openInPlayground")}
            <ArrowRight aria-hidden className="size-3.5" />
          </LocaleLink>{" "}
          {t("toPaintItsContentDynamic")}
        </p>
      </form>

      <AIArtResultPanel
        isGenerating={isGenerating}
        onLockSeed={
          ART_SUPPORTS_SEED
            ? (value) => {
                setSeed(String(value));
                setSeedLocked(true);
                toast.success(t("seedValueLocked", { value }), {
                  description: t("findItUnderAdvanced"),
                });
              }
            : undefined
        }
        onRetryClearer={(variant) =>
          art.retryClearer(currentRequest(), variant, meta)
        }
        pendingVariations={pendingVariations}
        result={result}
      />
    </div>
  );
}

function SliderField({
  id,
  label,
  value,
  onChange,
  range,
  description,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  range: { min: number; max: number; step: number; default: number };
  description: [string, string];
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-muted-foreground text-xs tabular-nums">
          {value}
        </span>
      </div>
      <Slider
        aria-label={label}
        disabled={disabled}
        id={id}
        max={range.max}
        min={range.min}
        onValueChange={([next]) => onChange(next ?? range.default)}
        step={range.step}
        value={[value]}
      />
      <div className="text-muted-foreground flex justify-between text-xs">
        <span>{description[0]}</span>
        <span>{description[1]}</span>
      </div>
    </div>
  );
}

const formatAllowance = (value: number | null) =>
  value === null ? "unlimited" : String(value);

function CreditsNote({
  credits,
  allowances,
  signedIn,
  variations,
}: {
  credits: AIArtCredits | null;
  allowances: AIArtAllowances;
  signedIn: boolean;
  variations: number;
}) {
  const t = useTranslations("aiArt.aiArtStudio");
  const plans = `Free ${formatAllowance(allowances.free)}, Pro ${formatAllowance(allowances.pro)}, Business ${formatAllowance(allowances.business)} (shared by the team) images a month.`;
  if (!signedIn) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("signInToGeneratePlans", { plans })}
      </p>
    );
  }
  if (!credits) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("eachImageUses1Ai", { plans })}
      </p>
    );
  }
  const resets = new Date(credits.resetsAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  if (credits.remaining === null) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("unlimitedAiArtOnYour", { variations })}
      </p>
    );
  }
  return (
    <p className="text-muted-foreground text-xs">
      {t.rich("creditsLeft", {
        remaining: credits.remaining,
        limit: credits.limit ?? 0,
        pooled: credits.pooled ? "yes" : "no",
        resets,
        variations,
        count: (chunks) => (
          <span className="text-foreground font-medium tabular-nums">
            {chunks}
          </span>
        ),
      })}
      {credits.remaining < variations && (
        <span className="text-amber-600 dark:text-amber-400">
          {" "}
          {credits.plan === "business"
            ? t("notEnoughLeft", { variations })
            : t("notEnoughLeftOrUpgrade", { variations })}
        </span>
      )}
    </p>
  );
}
