"use client";

import { authClient } from "@repo/auth/client";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GalleryAdd, Lock } from "iconsax-reactjs";
import { useRef, useState } from "react";
import { SignInLink } from "@/components/auth/sign-in-link";
import { track } from "@/lib/analytics";
import { apiFetch } from "@/lib/api-fetch";
import { useSessionGuard } from "@/lib/hooks/use-gaurds";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { MyErrorResponseSchema, UnauthorizedError } from "@/types/errors";
import { AIArtComingSoon } from "./ai-art-coming-soon";
import { AIArtPresetGallery } from "./ai-art-preset-gallery";
import { AIArtResultPanel } from "./ai-art-result";
import {
  type AIArtCredits,
  type AIArtCreditsResponse,
  type AIArtRequest,
  type AIArtResult,
  type AIArtUpscaleResult,
  type AIArtVariant,
  ART_CREATIVITY,
  ART_MAX_SEED,
  ART_MAX_VARIATIONS,
  ART_NEGATIVE_PROMPT_MAX_LENGTH,
  ART_PROMPT_MAX_LENGTH,
  ART_PROMPT_MIN_LENGTH,
  ART_QR_VISIBILITY,
  ART_TEXT_MAX_LENGTH,
} from "./config";
import { prepareReferenceImage } from "./image-utils";
import { AI_ART_PRESETS } from "./presets";

const CREDITS_QUERY_KEY = ["ai-art-credits"];
const REFERENCE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const REFERENCE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export interface AIArtAllowances {
  free: number | null;
  pro: number | null;
  business: number | null;
}

interface AIArtStudioProps {
  /** Server-side FAL_KEY check; a 503 from the API flips it off too. */
  configured: boolean;
  /** Monthly images per plan, from lib/plans (null = unlimited). */
  allowances: AIArtAllowances;
}

export function AIArtStudio({ configured, allowances }: AIArtStudioProps) {
  const [isConfigured, setIsConfigured] = useState(configured);
  const [text, setText] = useState("");
  const [prompt, setPrompt] = useState("");
  const [presetId, setPresetId] = useState<string | null>(null);
  const [negativePrompt, setNegativePrompt] = useState("");
  const [visibility, setVisibility] = useState<number>(
    ART_QR_VISIBILITY.default,
  );
  const [creativity, setCreativity] = useState<number>(ART_CREATIVITY.default);
  const [variations, setVariations] = useState(2);
  const [seed, setSeed] = useState("");
  const [seedLocked, setSeedLocked] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [result, setResult] = useState<AIArtResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingVariations, setPendingVariations] = useState(1);
  const [upscaled, setUpscaled] = useState<Record<string, AIArtUpscaleResult>>(
    {},
  );
  const [upscalingUrl, setUpscalingUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const { checkValidSession } = useSessionGuard();
  const { openGetProDialog, openUpgradeDialog } = useGetProDialogStore();
  const { data: creditsResponse } = useQuery({
    queryKey: CREDITS_QUERY_KEY,
    queryFn: async (): Promise<AIArtCreditsResponse> => {
      const response = await fetch("/api/ai/art/credits");
      if (!response.ok) throw new Error("Failed to load AI art credits");
      return response.json();
    },
    enabled: isConfigured && Boolean(session?.user.id),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const credits = creditsResponse?.credits ?? null;

  if (!isConfigured) {
    return <AIArtComingSoon />;
  }

  const lockedSeed =
    seedLocked && seed.trim() !== "" ? Number(seed.trim()) : undefined;
  const seedInvalid =
    seedLocked &&
    (lockedSeed === undefined ||
      !Number.isInteger(lockedSeed) ||
      lockedSeed < 0 ||
      lockedSeed > ART_MAX_SEED);
  const notEnoughCredits =
    credits?.remaining !== null &&
    credits?.remaining !== undefined &&
    credits.remaining < variations;
  const canSubmit =
    text.trim().length > 0 &&
    prompt.trim().length >= ART_PROMPT_MIN_LENGTH &&
    !seedInvalid &&
    !isGenerating;

  const setCredits = (next: AIArtCredits | null) => {
    if (next) {
      queryClient.setQueryData<AIArtCreditsResponse>(CREDITS_QUERY_KEY, {
        configured: true,
        credits: next,
      });
    }
  };

  const showError = async (response: Response, title: string) => {
    const parsed = MyErrorResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    const error = parsed.success ? parsed.data : {};

    if (error.code === "AI_NOT_CONFIGURED") {
      setIsConfigured(false);
      return;
    }
    if (error.code === "SUBSCRIPTION_REQUIRED") {
      if (credits?.plan === "pro") openUpgradeDialog("business");
      else openGetProDialog();
    }

    const details = (error.data as { details?: { message?: string }[] })
      ?.details;
    toast.error(title, {
      description:
        details?.[0]?.message ??
        error.message ??
        "Something went wrong. Please try again.",
    });
    queryClient.invalidateQueries({ queryKey: CREDITS_QUERY_KEY });
  };

  const generate = async (request: AIArtRequest) => {
    if (!checkValidSession("signin")) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    setPendingVariations(request.variations ?? 1);

    try {
      const response = await apiFetch("/api/ai/art", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        await showError(response, "Couldn't generate QR art");
        return;
      }

      const next = (await response.json()) as AIArtResult;
      setResult(next);
      setCredits(next.credits);
      if (next.failed > 0) {
        toast.warning(
          `${next.failed} of ${next.failed + next.variants.length} variations failed`,
          { description: "Those credits were refunded." },
        );
      }
      track("ai_art_generated", {
        visibility: request.visibility,
        creativity: request.creativity,
        variations: request.variations,
        locked_seed: request.seed !== undefined,
        reference: Boolean(request.reference),
        preset: presetId ?? undefined,
      });
    } catch (error) {
      if (controller.signal.aborted || error instanceof UnauthorizedError) {
        return;
      }
      toast.error("Couldn't generate QR art", {
        description: "Check your connection and try again.",
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsGenerating(false);
    }
  };

  const currentRequest = (): AIArtRequest => ({
    text: text.trim(),
    prompt: prompt.trim(),
    ...(negativePrompt.trim() && { negativePrompt: negativePrompt.trim() }),
    visibility,
    creativity,
    variations,
    ...(lockedSeed !== undefined && { seed: lockedSeed }),
    ...(reference && { reference }),
  });

  const upscale = async (variant: AIArtVariant) => {
    if (!checkValidSession("signin")) return;
    setUpscalingUrl(variant.imageUrl);
    try {
      const response = await apiFetch("/api/ai/art/upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: variant.imageUrl }),
      });
      if (!response.ok) {
        await showError(response, "Couldn't upscale this image");
        return;
      }
      const next = (await response.json()) as AIArtUpscaleResult;
      setUpscaled((previous) => ({ ...previous, [variant.imageUrl]: next }));
      setCredits(next.credits);
      toast.success("Upscaled 2× for print");
    } catch (error) {
      if (!(error instanceof UnauthorizedError)) {
        toast.error("Couldn't upscale this image", {
          description: "Check your connection and try again.",
        });
      }
    } finally {
      setUpscalingUrl(null);
    }
  };

  const handleReference = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!REFERENCE_TYPES.includes(file.type)) {
      toast.error("Unsupported image format", {
        description: "Use a PNG, JPG or WebP image.",
      });
      return;
    }
    if (file.size > REFERENCE_UPLOAD_MAX_BYTES) {
      toast.error("Image is too large", {
        description: "Reference images must be 10MB or smaller.",
      });
      return;
    }
    try {
      setReference(await prepareReferenceImage(file));
    } catch (error) {
      toast.error("Couldn't use this image", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="grid w-full gap-10 md:grid-cols-2">
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) generate(currentRequest());
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="ai-art-text">Link or text</Label>
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
            Shorter content means fewer, larger modules: cleaner art and more
            reliable scans.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="ai-art-prompt">Style</Label>
            <span className="text-muted-foreground text-xs tabular-nums">
              {prompt.length}/{ART_PROMPT_MAX_LENGTH}
            </span>
          </div>
          <AIArtPresetGallery
            activePresetId={presetId}
            disabled={isGenerating}
            onSelect={(preset) => {
              setPresetId(preset.id);
              setPrompt(preset.prompt);
              setNegativePrompt(preset.negativePrompt ?? "");
            }}
          />
          <Textarea
            disabled={isGenerating}
            id="ai-art-prompt"
            maxLength={ART_PROMPT_MAX_LENGTH}
            onChange={(event) => {
              setPrompt(event.target.value);
              const preset = AI_ART_PRESETS.find((p) => p.id === presetId);
              if (preset && preset.prompt !== event.target.value) {
                setPresetId(null);
              }
            }}
            placeholder="Describe a scene, e.g. a lighthouse on a rocky coast at sunset, oil painting"
            rows={3}
            value={prompt}
          />
        </div>

        <SliderField
          description={["More artistic", "Clearer code"]}
          disabled={isGenerating}
          id="ai-art-visibility"
          label="QR visibility"
          onChange={setVisibility}
          range={ART_QR_VISIBILITY}
          value={visibility}
        />
        <SliderField
          description={["Follows your prompt", "Interprets freely"]}
          disabled={isGenerating}
          id="ai-art-creativity"
          label="Creativity"
          onChange={setCreativity}
          range={ART_CREATIVITY}
          value={creativity}
        />

        <div className="flex flex-col gap-2">
          <Label id="ai-art-variations-label">Variations</Label>
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
            Each variation uses a different seed and 1 credit; every result is
            scan-checked and the best one is picked for you.
          </p>
        </div>

        <details className="group rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Advanced: negative prompt, seed, reference image
          </summary>
          <div className="mt-4 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ai-art-negative">Negative prompt</Label>
              <Textarea
                disabled={isGenerating}
                id="ai-art-negative"
                maxLength={ART_NEGATIVE_PROMPT_MAX_LENGTH}
                onChange={(event) => setNegativePrompt(event.target.value)}
                placeholder="Things to avoid, e.g. people, buildings, dark colors"
                rows={2}
                value={negativePrompt}
              />
              <p className="text-muted-foreground text-xs">
                Added to QRdx's defaults (blurry, low quality, text,
                watermarks…).
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="ai-art-seed">Seed</Label>
                <div className="flex items-center gap-2">
                  <Label
                    className="text-muted-foreground text-xs"
                    htmlFor="ai-art-seed-lock"
                  >
                    Lock seed
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
                placeholder={seedLocked ? "e.g. 42" : "Random each run"}
                value={seed}
              />
              <p className="text-muted-foreground text-xs">
                The same seed and settings give the same image; variations use
                seed, seed + 1, …
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Reference image</Label>
              <input
                accept={REFERENCE_TYPES.join(",")}
                aria-label="Upload a reference image"
                className="sr-only"
                onChange={handleReference}
                ref={referenceInputRef}
                type="file"
              />
              {reference ? (
                <div className="flex items-center gap-3">
                  <img
                    alt="Reference (grayscale)"
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
                    Remove
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
                  Upload reference
                </Button>
              )}
              <p className="text-muted-foreground text-xs">
                Optional. Its light and dark shapes (in grayscale) are blended
                into the hidden QR guide to steer the composition; colors and
                style still come from your prompt. It's resized in your browser
                and sent to fal.ai inside that guide image.
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
                ? "Generating…"
                : `Generate ${variations > 1 ? `${variations} variations` : "QR art"}`}
            </Button>
            {isGenerating && (
              <Button
                onClick={() => abortRef.current?.abort()}
                type="button"
                variant="outline"
              >
                <Close />
                Cancel
              </Button>
            )}
          </div>
          <CreditsNote
            allowances={allowances}
            credits={credits}
            signedIn={Boolean(session?.user.id)}
            variations={variations}
          />
        </div>

        <div className="bg-muted/50 flex items-start gap-3 rounded-lg border p-3 text-sm">
          <Lock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <p className="text-muted-foreground">
            <span className="text-foreground font-medium">
              AI art codes are static.
            </span>{" "}
            The content is baked into the image and can't be changed after you
            share it. For a link you can edit later, with scan analytics, create
            a{" "}
            <SignInLink
              className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
              href="/dashboard"
            >
              dynamic code
            </SignInLink>{" "}
            and use its short link here.
          </p>
        </div>
      </form>

      <AIArtResultPanel
        isGenerating={isGenerating}
        onLockSeed={(value) => {
          setSeed(String(value));
          setSeedLocked(true);
          toast.success(`Seed ${value} locked`, {
            description: "Find it under Advanced.",
          });
        }}
        onRetryClearer={(variant) =>
          result &&
          generate({
            ...currentRequest(),
            text: result.text,
            visibility: Math.min(
              ART_QR_VISIBILITY.max,
              result.visibility + ART_QR_VISIBILITY.retryStep,
            ),
            creativity: result.creativity,
            variations: 1,
            seed: variant.seed,
          })
        }
        onUpscale={upscale}
        pendingVariations={pendingVariations}
        result={result}
        upscaled={upscaled}
        upscalingUrl={upscalingUrl}
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
  const plans = `Free ${formatAllowance(allowances.free)}, Pro ${formatAllowance(allowances.pro)}, Business ${formatAllowance(allowances.business)} (shared by the team) images a month.`;
  if (!signedIn) {
    return (
      <p className="text-muted-foreground text-xs">
        Sign in to generate. {plans}
      </p>
    );
  }
  if (!credits) {
    return (
      <p className="text-muted-foreground text-xs">
        Each image uses 1 AI art credit; failed images are refunded. {plans}
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
        Unlimited AI art on your plan. This run uses {variations}.
      </p>
    );
  }
  return (
    <p className="text-muted-foreground text-xs">
      <span className="text-foreground font-medium tabular-nums">
        {credits.remaining} of {credits.limit}
      </span>{" "}
      AI art images left this month
      {credits.pooled ? " (shared by your team)" : ""}, resets {resets}. This
      run uses {variations}; failed images are refunded.
      {credits.remaining < variations && (
        <span className="text-amber-600 dark:text-amber-400">
          {" "}
          Not enough left for {variations}: pick fewer variations
          {credits.plan === "business" ? "." : " or upgrade."}
        </span>
      )}
    </p>
  );
}
