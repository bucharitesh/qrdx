"use client";

import { toast } from "@repo/design-system";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { MagicStar } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { workspaceRequestHeaders } from "@/components/workspace-provider";
import { apiFetch } from "@/lib/api-fetch";
import { MyErrorResponseSchema } from "@/types/errors";
import type {
  AIArtRequest,
  ArtDescribeRequest,
  ArtDescribeResult,
} from "./config";

/**
 * Dev only, like use-ai-art-run.ts: with the AI art mock on, descriptions
 * come from dev-mock-art.ts. Outside development the module is never bundled.
 */
const loadDevMock =
  process.env.NODE_ENV === "development"
    ? () => import("./dev-mock-art")
    : null;

/** What "Write one for me" sends for an art request: its mode, look and photo. */
export function describeRequestFor(request: AIArtRequest): ArtDescribeRequest {
  return {
    ...(request.mode && { mode: request.mode }),
    ...(request.style && { style: request.style }),
    ...(request.photo && { photo: request.photo }),
    ...(request.prompt?.trim() && { hint: request.prompt.trim() }),
  };
}

/**
 * "Write one for me" (POST /api/ai/art/describe): a description written for
 * the mode, look and photo picked, building on what's typed. Null after a
 * failure, which it explains in a toast. Never uses an art credit.
 */
export function useArtPromptWriter({ mock }: { mock: boolean }) {
  const t = useTranslations("editor.art.artLooks");
  const [writing, setWriting] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const write = async (request: ArtDescribeRequest): Promise<string | null> => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setWriting(true);
    try {
      if (mock && loadDevMock) {
        return (await (await loadDevMock()).mockArtDescription(request)).prompt;
      }
      const response = await apiFetch("/api/ai/art/describe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...workspaceRequestHeaders(),
        },
        body: JSON.stringify(request),
        signal: current.signal,
      });
      if (!response.ok) {
        const error = MyErrorResponseSchema.safeParse(
          await response.json().catch(() => null),
        );
        toast.error(t("couldntWrite"), {
          description: error.success ? error.data.message : undefined,
        });
        return null;
      }
      return ((await response.json()) as ArtDescribeResult).prompt;
    } catch {
      if (!current.signal.aborted) {
        toast.error(t("couldntWrite"), { description: t("checkConnection") });
      }
      return null;
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setWriting(false);
      }
    }
  };

  return {
    writing,
    write,
    cancel: () => controller.current?.abort(),
  };
}

/** The small button next to the description's label. */
export function ArtLookWriteButton({
  writing,
  disabled,
  onClick,
  className,
}: {
  writing: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  const t = useTranslations("editor.art.artLooks");
  return (
    <Button
      className={cn(
        "text-muted-foreground -mr-2 h-7 gap-1.5 text-xs",
        className,
      )}
      disabled={disabled || writing}
      onClick={onClick}
      size="sm"
      type="button"
      variant="ghost"
    >
      {writing ? <ModuleOrbit /> : <MagicStar aria-hidden />}
      {writing ? t("writing") : t("writeOneForMe")}
    </Button>
  );
}
