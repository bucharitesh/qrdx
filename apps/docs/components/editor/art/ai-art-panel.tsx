"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Bot, Close } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/design-system/components/ui/collapsible";
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
import { useIsMobile } from "@repo/design-system/hooks/use-mobile";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowDown2,
  Edit2,
  Flash,
  GalleryAdd,
  Gallery as GalleryIcon,
  InfoCircle,
  Link21,
} from "iconsax-reactjs";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useDynamicLinkStore } from "@/components/editor/dynamic-link-toggle";
import { AIArtPresetGallery } from "@/components/sections/ai-art/ai-art-preset-gallery";
import { lockedSeedFor } from "@/components/sections/ai-art/ai-art-run";
import {
  type AIArtCredits,
  type AIArtRequest,
  ART_CREATIVITY,
  ART_MAX_VARIATIONS,
  ART_NEGATIVE_PROMPT_MAX_LENGTH,
  ART_PROMPT_MAX_LENGTH,
  ART_QR_VISIBILITY,
  ART_TEXT_MAX_LENGTH,
} from "@/components/sections/ai-art/config";
import { prepareReferenceImage } from "@/components/sections/ai-art/image-utils";
import {
  AI_ART_REFERENCE_TYPES,
  readReferenceFile,
  useAIArtRun,
} from "@/components/sections/ai-art/use-ai-art-run";
import { ART_MODEL_LABEL, ART_SUPPORTS_SEED } from "@/lib/ai/art-models";
import { useControlsTabFromUrl } from "@/lib/hooks/use-controls-tab-from-url";
import { useArtSessionStore } from "@/store/art-session-store";
import { useAuthStore } from "@/store/auth-store";
import { useQREditorStore } from "@/store/editor-store";
import { CONTENT_TYPES_METADATA } from "@/types/qr-content";
import type { QRStyle } from "@/types/theme";
import {
  artGenerateIntent,
  artPayloadIssue,
  artRequestFor,
  artSeedsFor,
  canGenerate,
  shouldResumeArt,
} from "./ai-art-intent";
import { ArtResultActions, useShownArt } from "./art-canvas";

const displayLink = (url: string) => url.replace(/^https?:\/\//, "");

interface AIArtPanelProps {
  /** The editor's design, for "Use my logo as reference" */
  style: QRStyle;
}

/**
 * AI art in the Art tab, sized for the 22rem panel. It paints the editor's
 * content (the dynamic short link when the code is linked to one); results
 * cover the preview (art-canvas.tsx). Signed out, Generate asks you to sign
 * in and runs once you're back ("AI_ART_GENERATE").
 */
export function AIArtPanel({ style }: AIArtPanelProps) {
  const payload = useQREditorStore((state) => state.value);
  const contentType = useQREditorStore((state) => state.contentType);
  const { handleSetTab } = useControlsTabFromUrl();
  const { data: session } = authClient.useSession();
  const linked = useDynamicLinkStore((state) => state.code);
  const openAuthDialog = useAuthStore((state) => state.openAuthDialog);
  const draft = useArtSessionStore((state) => state.draft);
  const updateDraft = useArtSessionStore((state) => state.updateDraft);
  const applyStylePreset = useArtSessionStore(
    (state) => state.applyStylePreset,
  );
  const resume = useArtSessionStore((state) => state.resume);
  const canvasOpen = useArtSessionStore((state) => state.canvasOpen);
  const setCanvasOpen = useArtSessionStore((state) => state.setCanvasOpen);
  const isMobile = useIsMobile();
  const shown = useShownArt();

  const art = useAIArtRun({
    store: useArtSessionStore,
    onSignedOut: () =>
      openAuthDialog(
        "signin",
        "AI_ART_GENERATE",
        artGenerateIntent(payload, useArtSessionStore.getState().draft),
      ),
  });

  const issue = artPayloadIssue(payload);
  const dynamic =
    linked &&
    session?.user?.id === linked.userId &&
    linked.shortLink === payload.trim()
      ? linked
      : null;
  const ready = canGenerate(payload, draft);
  const generating = art.isGenerating;
  const result = art.run && art.run.text === payload.trim() ? art.run : null;

  const run = async (request: AIArtRequest, seeds: number[]) => {
    if (!art.signedIn) {
      await art.generate(request, seeds);
      return;
    }
    setCanvasOpen(true);
    const outcome = await art.generate(request, seeds, {
      preset: draft.presetId,
      lockedSeed:
        lockedSeedFor(draft.seed, draft.seedLocked, ART_SUPPORTS_SEED) !==
        undefined,
    });
    const state = useArtSessionStore.getState();
    if (outcome?.status === "done") state.select(0);
    else if (!state.run) state.setCanvasOpen(false);
  };

  const generate = () => {
    if (!ready || generating) return;
    void run(artRequestFor(payload, draft), artSeedsFor(draft));
  };

  // Back from sign-in with Generate pressed: run it once, for the same content.
  const runResume = useEffectEvent(() => {
    const intent = useArtSessionStore.getState().resume;
    useArtSessionStore.getState().setResume(null);
    if (!intent || generating || !shouldResumeArt(intent, payload)) return;
    void run(artRequestFor(payload, intent.draft), artSeedsFor(intent.draft));
  });
  useEffect(() => {
    if (resume && art.signedIn && !art.sessionPending) runResume();
  }, [resume, art.signedIn, art.sessionPending]);

  return (
    <div className="space-y-5">
      {isMobile && shown.result && shown.variant && !shown.generating && (
        <ArtResultActions
          className="border-b pb-5"
          result={shown.result}
          variant={shown.variant}
        />
      )}

      <EncodesNote
        contentType={contentType}
        dynamicLink={dynamic?.shortLink ?? null}
        issue={issue}
        onOpenContent={() => handleSetTab("content")}
        payload={payload}
      />

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="art-ai-prompt">Style</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {draft.prompt.length}/{ART_PROMPT_MAX_LENGTH}
          </span>
        </div>
        <AIArtPresetGallery
          activePresetId={draft.presetId}
          disabled={generating}
          onSelect={applyStylePreset}
        />
        <Textarea
          disabled={generating}
          id="art-ai-prompt"
          maxLength={ART_PROMPT_MAX_LENGTH}
          onChange={(event) => {
            const prompt = event.target.value;
            updateDraft({ prompt, ...(draft.presetId && { presetId: null }) });
          }}
          placeholder="Describe a scene, e.g. a lighthouse on a rocky coast at sunset, oil painting"
          rows={3}
          value={draft.prompt}
        />
      </div>

      <ArtSlider
        disabled={generating}
        ends={["More artistic", "Clearer code"]}
        id="art-ai-visibility"
        label="QR visibility"
        onChange={(visibility) => updateDraft({ visibility })}
        range={ART_QR_VISIBILITY}
        value={draft.visibility}
      />

      <div className="space-y-2">
        <Label id="art-ai-variations">Variations</Label>
        <ToggleGroup
          aria-labelledby="art-ai-variations"
          className="w-full"
          disabled={generating}
          onValueChange={(value) =>
            value && updateDraft({ variations: Number(value) })
          }
          type="single"
          value={String(draft.variations)}
          variant="outline"
        >
          {Array.from({ length: ART_MAX_VARIATIONS }, (_, index) => (
            <ToggleGroupItem
              className="flex-1"
              key={index}
              value={String(index + 1)}
            >
              {index + 1}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-muted-foreground text-xs">
          Each variation is its own image and uses 1 credit. The best one to
          scan is picked for you.
        </p>
      </div>

      <AdvancedOptions disabled={generating} style={style} />

      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={
              !ready ||
              generating ||
              (art.signedIn && art.lacksCredits(draft.variations))
            }
            onClick={generate}
          >
            {generating ? <Spinner /> : <Bot />}
            {generating
              ? "Generating…"
              : !art.signedIn
                ? "Sign in to generate"
                : `Generate ${draft.variations > 1 ? `${draft.variations} variations` : "QR art"}`}
          </Button>
          {generating && (
            <Button onClick={art.cancel} variant="outline">
              <Close />
              Cancel
            </Button>
          )}
        </div>
        <CreditsLine
          credits={art.credits}
          signedIn={art.signedIn}
          variations={draft.variations}
        />
      </div>

      {result && !canvasOpen && !generating && (
        <Button
          className="w-full"
          onClick={() => setCanvasOpen(true)}
          variant="outline"
        >
          <GalleryIcon />
          Show your {result.variants.length > 1 ? "results" : "result"}
        </Button>
      )}
    </div>
  );
}

/** What the art will encode, and why it can't yet. */
function EncodesNote({
  payload,
  contentType,
  dynamicLink,
  issue,
  onOpenContent,
}: {
  payload: string;
  contentType: string;
  dynamicLink: string | null;
  issue: ReturnType<typeof artPayloadIssue>;
  onOpenContent: () => void;
}) {
  const box = "bg-muted/40 flex gap-2.5 rounded-lg border p-3 text-xs";
  if (issue === "empty") {
    return (
      <div className={cn(box, "flex-col")}>
        <p className="text-muted-foreground flex gap-2">
          <InfoCircle aria-hidden className="mt-px size-4 shrink-0" />
          Add your content first: AI art paints the code you're editing.
        </p>
        <Button
          className="self-start"
          onClick={onOpenContent}
          size="sm"
          variant="outline"
        >
          <Edit2 />
          Add content
        </Button>
      </div>
    );
  }
  if (issue === "too-long") {
    return (
      <p className={cn(box, "text-muted-foreground")} role="status">
        <InfoCircle aria-hidden className="mt-px size-4 shrink-0" />
        AI art fits up to {ART_TEXT_MAX_LENGTH} characters, and this code has{" "}
        {payload.trim().length}. A shorter link, or a dynamic code's short link,
        fits.
      </p>
    );
  }
  if (dynamicLink) {
    return (
      <p className={cn(box, "text-muted-foreground")}>
        <Flash aria-hidden className="mt-px size-4 shrink-0" variant="Bold" />
        <span className="min-w-0 text-pretty">
          Encodes your dynamic link{" "}
          <span className="text-foreground font-medium break-all">
            {displayLink(dynamicLink)}
          </span>
          , so you can change where it points after printing.
        </span>
      </p>
    );
  }
  const label =
    CONTENT_TYPES_METADATA.find((meta) => meta.type === contentType)?.label ??
    "QR";
  return (
    <p className={cn(box, "text-muted-foreground")}>
      <Link21 aria-hidden className="mt-px size-4 shrink-0" />
      <span className="min-w-0 text-pretty">
        {contentType === "url" ? (
          <>
            Encodes{" "}
            <span className="text-foreground font-medium break-all">
              {displayLink(payload.trim())}
            </span>
            , fixed once printed. Make it dynamic in Content to change it later.
          </>
        ) : (
          <>Encodes your {label} details, fixed once printed.</>
        )}
      </span>
    </p>
  );
}

function ArtSlider({
  id,
  label,
  value,
  onChange,
  range,
  ends,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  range: { min: number; max: number; step: number; default: number };
  ends: [string, string];
  disabled: boolean;
}) {
  return (
    <div className="space-y-2.5">
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
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  );
}

/** Creativity, things to avoid, seed and a reference image (or your logo). */
function AdvancedOptions({
  style,
  disabled,
}: {
  style: QRStyle;
  disabled: boolean;
}) {
  const draft = useArtSessionStore((state) => state.draft);
  const updateDraft = useArtSessionStore((state) => state.updateDraft);
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const logo = style.customLogo || null;

  const setLogoReference = async (on: boolean) => {
    if (!on || !logo) {
      updateDraft({ reference: null, referenceIsLogo: false });
      return;
    }
    setPreparing(true);
    try {
      updateDraft({
        reference: await prepareReferenceImage(logo),
        referenceIsLogo: true,
      });
    } catch {
      toast.error("Couldn't use your logo", {
        description: "Upload it as a reference image instead.",
      });
    } finally {
      setPreparing(false);
    }
  };

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reference = await readReferenceFile(file);
    if (reference) updateDraft({ reference, referenceIsLogo: false });
  };

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger asChild>
        <Button
          className="text-muted-foreground -ml-2.5 h-7 text-xs"
          size="sm"
          variant="ghost"
        >
          {ART_SUPPORTS_SEED
            ? "Advanced: creativity, seed, reference"
            : "Advanced: creativity, reference"}
          <ArrowDown2
            className={cn(
              "size-3.5 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-5 pt-3">
        <ArtSlider
          disabled={disabled}
          ends={["Follows your prompt", "Interprets freely"]}
          id="art-ai-creativity"
          label="Creativity"
          onChange={(creativity) => updateDraft({ creativity })}
          range={ART_CREATIVITY}
          value={draft.creativity}
        />

        <div className="space-y-2">
          <Label htmlFor="art-ai-negative">Things to avoid</Label>
          <Textarea
            disabled={disabled}
            id="art-ai-negative"
            maxLength={ART_NEGATIVE_PROMPT_MAX_LENGTH}
            onChange={(event) =>
              updateDraft({ negativePrompt: event.target.value })
            }
            placeholder="e.g. people, buildings, dark colors"
            rows={2}
            value={draft.negativePrompt}
          />
        </div>

        {ART_SUPPORTS_SEED && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="art-ai-seed">Seed</Label>
              <div className="flex items-center gap-2">
                <Label
                  className="text-muted-foreground text-xs"
                  htmlFor="art-ai-seed-lock"
                >
                  Lock seed
                </Label>
                <Switch
                  checked={draft.seedLocked}
                  disabled={disabled}
                  id="art-ai-seed-lock"
                  onCheckedChange={(seedLocked) => updateDraft({ seedLocked })}
                />
              </div>
            </div>
            <Input
              disabled={disabled || !draft.seedLocked}
              id="art-ai-seed"
              inputMode="numeric"
              onChange={(event) =>
                updateDraft({ seed: event.target.value.replace(/[^\d]/g, "") })
              }
              placeholder={draft.seedLocked ? "e.g. 42" : "Random each run"}
              value={draft.seed}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Reference image</Label>
          {logo && (
            <div className="flex items-center justify-between gap-3">
              <Label
                className="cursor-pointer text-xs font-normal"
                htmlFor="art-ai-logo"
              >
                Use my logo as reference
              </Label>
              <Switch
                checked={draft.referenceIsLogo && Boolean(draft.reference)}
                disabled={disabled || preparing}
                id="art-ai-logo"
                onCheckedChange={(on) => void setLogoReference(on)}
              />
            </div>
          )}
          <input
            accept={AI_ART_REFERENCE_TYPES.join(",")}
            aria-label="Upload a reference image"
            className="sr-only"
            onChange={upload}
            ref={inputRef}
            type="file"
          />
          {draft.reference ? (
            <div className="flex items-center gap-3">
              <img
                alt="Reference"
                className="size-12 rounded border object-cover"
                src={draft.reference}
              />
              <Button
                disabled={disabled}
                onClick={() =>
                  updateDraft({ reference: null, referenceIsLogo: false })
                }
                size="sm"
                variant="ghost"
              >
                <Close />
                Remove
              </Button>
            </div>
          ) : (
            <Button
              disabled={disabled || preparing}
              onClick={() => inputRef.current?.click()}
              size="sm"
              variant="outline"
            >
              {preparing ? <Spinner /> : <GalleryAdd />}
              Upload reference
            </Button>
          )}
          <p className="text-muted-foreground text-xs text-pretty">
            Optional. Its colors and shapes carry over into the artwork. It's
            resized in your browser and sent with your prompt through Vercel AI
            Gateway to {ART_MODEL_LABEL}.
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function CreditsLine({
  credits,
  signedIn,
  variations,
}: {
  credits: AIArtCredits | null;
  signedIn: boolean;
  variations: number;
}) {
  const className = "text-muted-foreground text-xs text-pretty";
  if (!signedIn) {
    return (
      <p className={className}>
        Sign in to generate. Every plan includes AI art images each month;{" "}
        <Link
          className="text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
          href="/pricing"
        >
          see plans
        </Link>
        .
      </p>
    );
  }
  if (!credits) {
    return (
      <p className={className}>
        Each image uses 1 AI art credit; failed images are refunded.
      </p>
    );
  }
  if (credits.remaining === null) {
    return (
      <p className={className}>
        Unlimited AI art on your plan. This run uses {variations}.
      </p>
    );
  }
  const resets = new Date(credits.resetsAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return (
    <p className={className}>
      <span className="text-foreground font-medium tabular-nums">
        {credits.remaining} of {credits.limit}
      </span>{" "}
      AI art images left this month
      {credits.pooled ? " (shared by your team)" : ""}, resets {resets}. This
      run uses {variations}.
      {credits.remaining < variations && (
        <span className="text-amber-600 dark:text-amber-400">
          {" "}
          Not enough left: pick fewer variations
          {credits.plan === "business" ? "." : " or upgrade."}
        </span>
      )}
    </p>
  );
}
