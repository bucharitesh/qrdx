"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, ServerOff, Sparkles, X } from "lucide-react";
import Link from "next/link";
import posthog from "posthog-js";
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { AI_REQUEST_FREE_TIER_LIMIT } from "@/lib/constants";
import { useSessionGuard } from "@/lib/hooks/use-gaurds";
import {
  SUBSCRIPTION_STATUS_QUERY_KEY,
  useSubscription,
} from "@/lib/hooks/use-subscription";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { MyErrorResponseSchema, UnauthorizedError } from "@/types/errors";
import { AIArtPresetGallery } from "./ai-art-preset-gallery";
import { AIArtResultPanel } from "./ai-art-result";
import {
  type AIArtResult,
  ART_CREATIVITY,
  ART_PROMPT_MAX_LENGTH,
  ART_PROMPT_MIN_LENGTH,
  ART_TEXT_MAX_LENGTH,
} from "./config";

interface ArtRequest {
  text: string;
  prompt: string;
  creativity: number;
  seed?: number;
}

interface AIArtStudioProps {
  /** Server-side FAL_KEY check; a 503 from the API flips it off too. */
  configured: boolean;
}

export function AIArtStudio({ configured }: AIArtStudioProps) {
  const [isConfigured, setIsConfigured] = useState(configured);
  const [text, setText] = useState("");
  const [prompt, setPrompt] = useState("");
  const [creativity, setCreativity] = useState<number>(ART_CREATIVITY.default);
  const [result, setResult] = useState<AIArtResult | null>(null);
  /** Prompt behind `result`, so retries reuse it even if the form changed. */
  const [resultPrompt, setResultPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const queryClient = useQueryClient();
  const { checkValidSession } = useSessionGuard();
  const { openGetProDialog } = useGetProDialogStore();

  if (!isConfigured) {
    return <AIArtUnavailable />;
  }

  const canSubmit =
    text.trim().length > 0 &&
    prompt.trim().length >= ART_PROMPT_MIN_LENGTH &&
    !isGenerating;

  const showError = async (response: Response) => {
    const parsed = MyErrorResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    const error = parsed.success ? parsed.data : {};

    if (error.code === "AI_NOT_CONFIGURED") {
      setIsConfigured(false);
      return;
    }
    if (error.code === "SUBSCRIPTION_REQUIRED") {
      openGetProDialog();
    }

    const details = (error.data as { details?: { message?: string }[] })
      ?.details;
    toast.error("Couldn't generate QR art", {
      description:
        details?.[0]?.message ??
        error.message ??
        "Something went wrong. Please try again.",
    });
  };

  const generate = async (request: ArtRequest) => {
    if (!checkValidSession("signin")) return;

    setCreativity(request.creativity);
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);

    try {
      const response = await apiFetch("/api/ai/art", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        await showError(response);
        return;
      }

      setResult((await response.json()) as AIArtResult);
      setResultPrompt(request.prompt);
      try {
        posthog.capture("AI_ART_GENERATED", {
          creativity: request.creativity,
          reusedSeed: request.seed !== undefined,
        });
      } catch {}
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
      queryClient.invalidateQueries({
        queryKey: [SUBSCRIPTION_STATUS_QUERY_KEY],
      });
    }
  };

  return (
    <div className="grid w-full gap-10 md:grid-cols-2">
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) {
            generate({ text: text.trim(), prompt: prompt.trim(), creativity });
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="ai-art-text">Link or text</Label>
          <Input
            id="ai-art-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={ART_TEXT_MAX_LENGTH}
            placeholder="https://example.com"
            autoComplete="off"
            spellCheck={false}
            disabled={isGenerating}
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
            activePrompt={prompt}
            disabled={isGenerating}
            onSelect={(preset) => setPrompt(preset.prompt)}
          />
          <Textarea
            id="ai-art-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={ART_PROMPT_MAX_LENGTH}
            rows={3}
            placeholder="Describe a scene, e.g. a lighthouse on a rocky coast at sunset, oil painting"
            disabled={isGenerating}
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="ai-art-creativity">Creativity</Label>
            <span className="text-muted-foreground text-xs tabular-nums">
              {creativity}
            </span>
          </div>
          <Slider
            id="ai-art-creativity"
            aria-label="Creativity"
            min={ART_CREATIVITY.min}
            max={ART_CREATIVITY.max}
            step={ART_CREATIVITY.step}
            value={[creativity]}
            onValueChange={([value]) =>
              setCreativity(value ?? ART_CREATIVITY.default)
            }
            disabled={isGenerating}
          />
          <div className="text-muted-foreground flex justify-between text-xs">
            <span>More scannable</span>
            <span>More artistic</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={!canSubmit}>
              {isGenerating ? <Spinner /> : <Sparkles />}
              {isGenerating ? "Generating…" : "Generate QR art"}
            </Button>
            {isGenerating && (
              <Button
                type="button"
                variant="outline"
                onClick={() => abortRef.current?.abort()}
              >
                <X />
                Cancel
              </Button>
            )}
          </div>
          <CreditsNote />
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
            <Link href="/dashboard" className="text-primary hover:underline">
              dynamic code
            </Link>{" "}
            and use its short link here.
          </p>
        </div>
      </form>

      <AIArtResultPanel
        result={result}
        isGenerating={isGenerating}
        canRetryLower={
          result !== null && result.creativity > ART_CREATIVITY.min
        }
        // Same seed and inputs, closer to the plain code.
        onRetryLower={() =>
          result &&
          generate({
            text: result.text,
            prompt: resultPrompt,
            creativity: Math.max(
              ART_CREATIVITY.min,
              result.creativity - ART_CREATIVITY.retryStep,
            ),
            seed: result.seed,
          })
        }
        onRegenerate={() =>
          result &&
          generate({
            text: result.text,
            prompt: resultPrompt,
            creativity: result.creativity,
          })
        }
      />
    </div>
  );
}

function CreditsNote() {
  const { data: session } = authClient.useSession();
  const { subscriptionStatus } = useSubscription();

  let note = "Each image uses 1 AI credit. Failed generations are refunded.";
  if (!session) {
    note = "Sign in to generate. Each image uses 1 AI credit.";
  } else if (subscriptionStatus?.isSubscribed) {
    note = "Each image uses 1 AI credit. Pro has no credit limit.";
  } else if (subscriptionStatus) {
    note = `Each image uses 1 AI credit. ${subscriptionStatus.requestsRemaining} of ${AI_REQUEST_FREE_TIER_LIMIT} free credits left (shared with AI themes).`;
  }

  return <p className="text-muted-foreground text-xs">{note}</p>;
}

function AIArtUnavailable() {
  return (
    <div className="bg-muted/40 mx-auto flex max-w-xl flex-col items-center gap-4 rounded-xl border p-8 text-center">
      <ServerOff className="text-muted-foreground size-8" />
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">
          AI QR art isn't available on this server
        </h2>
        <p className="text-muted-foreground text-sm">
          This deployment hasn't configured an image model (the{" "}
          <code>FAL_KEY</code> setting), so artwork can't be generated here.
          Everything else in QRdx works as usual.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/playground">Open the QR playground</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/ai">Try AI themes</Link>
        </Button>
      </div>
    </div>
  );
}
