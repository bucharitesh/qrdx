"use client";

// Everything an AI art surface does besides its form: the credits query,
// generating (one request per variation), cancelling, retrying with a
// clearer code, the error dialogs and toasts, and preparing a reference
// image. The /ai/art studio and the playground's Art tab share it; each
// passes the store its run lives in (ai-art-run.ts).

import { track } from "@repo/analytics";
import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { workspaceRequestHeaders } from "@/components/workspace-provider";
import { apiFetch } from "@/lib/api-fetch";
import { useAuthStore } from "@/store/auth-store";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import {
  MyErrorResponseSchema,
  type MyErrorResponseType,
} from "@/types/errors";
import {
  type AIArtRunOutcome,
  type AIArtRunState,
  ArtRequestError,
  cancelAIArt,
  clearerRequest,
  lacksCredits,
  runAIArt,
} from "./ai-art-run";
import type {
  AIArtCredits,
  AIArtCreditsResponse,
  AIArtRequest,
  AIArtResult,
  AIArtVariant,
  ArtPictureResult,
} from "./config";
import { prepareReferenceImage } from "./image-utils";

export const AI_ART_CREDITS_QUERY_KEY = ["ai-art-credits"];

const REFERENCE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const REFERENCE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const AI_ART_REFERENCE_TYPES = REFERENCE_TYPES;

/**
 * Dev only: with localStorage `qrdx-dev-ai-art-mock` set to "1", images and
 * credits come from dev-mock-art.ts in the browser: no sign-in, no credits,
 * no model. Outside development this is null, and the mock module is never
 * bundled.
 */
const devArtMock =
  process.env.NODE_ENV === "development"
    ? {
        enabled: () => {
          try {
            return window.localStorage.getItem("qrdx-dev-ai-art-mock") === "1";
          } catch {
            return false;
          }
        },
        load: () => import("./dev-mock-art"),
      }
    : null;

/** Analytics details of a run (never the prompt or the content). */
export interface AIArtRunMeta {
  preset?: string | null;
  lockedSeed?: boolean;
}

export interface UseAIArtRunOptions {
  /** Where the run lives: the studio's own store, or the playground's session */
  store: StoreApi<AIArtRunState>;
  /** Signed out, Generate calls this instead (default: open sign-in). */
  onSignedOut?: (request: AIArtRequest, seeds: number[]) => void;
}

export function useAIArtRun({ store, onSignedOut }: UseAIArtRunOptions) {
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const openAuthDialog = useAuthStore((state) => state.openAuthDialog);
  const { openGetProDialog, openUpgradeDialog } = useGetProDialogStore();
  const configured = useStore(store, (state) => state.configured);
  const run = useStore(store, (state) => state.run);
  const pending = useStore(store, (state) => state.pending);

  // Read after mount, so the server's HTML and the first render agree.
  const [mock, setMock] = useState(false);
  useEffect(() => {
    if (devArtMock?.enabled()) setMock(true);
  }, []);

  const signedIn = mock || Boolean(session?.user.id);
  const { data: creditsResponse } = useQuery({
    queryKey: mock
      ? [...AI_ART_CREDITS_QUERY_KEY, "dev-mock"]
      : AI_ART_CREDITS_QUERY_KEY,
    queryFn: async (): Promise<AIArtCreditsResponse> => {
      if (mock && devArtMock) return (await devArtMock.load()).mockArtCredits();
      const response = await fetch("/api/ai/art/credits", {
        headers: workspaceRequestHeaders(),
      });
      if (!response.ok) throw new Error("Failed to load AI art credits");
      return response.json();
    },
    enabled: configured && signedIn,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const credits = creditsResponse?.credits ?? null;
  const creditsRef = useRef(credits);
  creditsRef.current = credits;

  const setCredits = (next: AIArtCredits | null) => {
    if (!next || mock) return;
    queryClient.setQueryData<AIArtCreditsResponse>(AI_ART_CREDITS_QUERY_KEY, {
      configured: true,
      credits: next,
    });
  };

  const showError = (error: MyErrorResponseType | null, title: string) => {
    if (error?.code === "AI_NOT_CONFIGURED") return;
    if (error?.code === "SUBSCRIPTION_REQUIRED") {
      if (creditsRef.current?.plan === "pro") openUpgradeDialog("business");
      else openGetProDialog();
    }
    if (!error) {
      toast.error(title, {
        description: "Check your connection and try again.",
      });
      return;
    }
    const details = (error.data as { details?: { message?: string }[] })
      ?.details;
    toast.error(title, {
      description:
        details?.[0]?.message ??
        error.message ??
        "Something went wrong. Please try again.",
    });
  };

  const requestImage = async (
    request: AIArtRequest,
    signal: AbortSignal,
  ): Promise<AIArtResult> => {
    if (mock && devArtMock) {
      return (await devArtMock.load()).mockArtImage(request, signal);
    }
    const response = await apiFetch("/api/ai/art", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...workspaceRequestHeaders(),
      },
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok) {
      const parsed = MyErrorResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      throw new ArtRequestError(parsed.success ? parsed.data : {});
    }
    return (await response.json()) as AIArtResult;
  };

  /** Scene mode's first step: its picture, sealed by the server. */
  const requestPicture = async (
    request: AIArtRequest,
    signal: AbortSignal,
  ): Promise<ArtPictureResult> => {
    if (mock && devArtMock) {
      return (await devArtMock.load()).mockArtPicture(request, signal);
    }
    const response = await apiFetch("/api/ai/art/picture", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...workspaceRequestHeaders(),
      },
      body: JSON.stringify({
        text: request.text,
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        style: request.style,
      }),
      signal,
    });
    if (!response.ok) {
      const parsed = MyErrorResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      throw new ArtRequestError(parsed.success ? parsed.data : {});
    }
    return (await response.json()) as ArtPictureResult;
  };

  const generate = async (
    request: AIArtRequest,
    seeds: number[],
    meta: AIArtRunMeta = {},
  ): Promise<AIArtRunOutcome | null> => {
    if (!signedIn) {
      if (onSignedOut) onSignedOut(request, seeds);
      else openAuthDialog("signin");
      return null;
    }

    const outcome = await runAIArt(
      store,
      { requestImage, requestPicture },
      request,
      seeds,
    );
    if (outcome.status === "aborted") {
      if (outcome.reason === "cleared") {
        toast("Your content changed, so the art stopped", {
          description: "Generate again to paint the new content.",
        });
      }
      return outcome;
    }
    if (outcome.status === "unauthorized") return outcome;

    setCredits(outcome.credits);
    if (!mock) {
      queryClient.invalidateQueries({ queryKey: AI_ART_CREDITS_QUERY_KEY });
    }
    if (outcome.status === "failed") {
      showError(outcome.error, "Couldn't generate QR art");
      return outcome;
    }

    const failed = outcome.run.failed;
    if (failed > 0) {
      toast.warning(`${failed} of ${seeds.length} variations failed`, {
        description:
          outcome.firstError?.message ?? "No AI credit was used for them.",
      });
    }
    if (!mock) {
      track("ai_art_generated", {
        visibility: request.visibility,
        creativity: request.creativity,
        variations: seeds.length,
        blended: outcome.run.variants.filter((item) => item.blended).length,
        locked_seed: Boolean(meta.lockedSeed),
        reference: Boolean(request.reference),
        preset: meta.preset ?? undefined,
        look: request.style,
        mode: request.mode ?? "code",
      });
    }
    return outcome;
  };

  /** The same seed and content again, with QR visibility one step up. */
  const retryClearer = (
    base: AIArtRequest,
    variant: AIArtVariant,
    meta?: AIArtRunMeta,
  ) => {
    const current = store.getState().run;
    if (!current) return Promise.resolve(null);
    return generate(clearerRequest(base, current), [variant.seed], meta);
  };

  return {
    /** False once the server said AI art isn't set up here */
    configured,
    credits,
    signedIn,
    sessionPending: sessionPending && !mock,
    /** Dev only: images come from dev-mock-art.ts */
    mock,
    run,
    isGenerating: pending > 0,
    pendingVariations: pending,
    lacksCredits: (variations: number) => lacksCredits(credits, variations),
    generate,
    retryClearer,
    cancel: () => cancelAIArt(store),
  };
}

/**
 * An uploaded reference image, checked and downsized in the browser (see
 * prepareReferenceImage), or null after telling the user what was wrong.
 */
export async function readReferenceFile(file: File): Promise<string | null> {
  if (!REFERENCE_TYPES.includes(file.type)) {
    toast.error("Unsupported image format", {
      description: "Use a PNG, JPG or WebP image.",
    });
    return null;
  }
  if (file.size > REFERENCE_UPLOAD_MAX_BYTES) {
    toast.error("Image is too large", {
      description: "Reference images must be 10MB or smaller.",
    });
    return null;
  }
  try {
    return await prepareReferenceImage(file);
  } catch (error) {
    toast.error("Couldn't use this image", {
      description: error instanceof Error ? error.message : undefined,
    });
    return null;
  }
}
