"use client";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import type { QRArtMode } from "qrdx/types";
import { useCallback } from "react";
import { useAvailability } from "@/components/availability-provider";
import {
  ArtControls,
  useVectorArt,
} from "@/components/editor/control-sections/art-controls";
import { InfoHint } from "@/components/help/info-hint";
import { usePostLoginAction } from "@/lib/hooks/use-post-login-action";
import {
  type ArtTabMode,
  resolveArtMode,
  useArtSessionStore,
} from "@/store/art-session-store";
import type { QRStyle } from "@/types/theme";
import { parseArtGenerateIntent } from "./ai-art-intent";
import { AIArtPanel } from "./ai-art-panel";

const MODE_COPY: Record<ArtTabMode, string> = {
  off: "A plain code. Logo QR and Image QR blend a picture into the dots, with no AI, in every format.",
  logo: "No AI: your logo becomes part of the code, in every format.",
  halftone: "No AI: your photo becomes part of the code, in every format.",
  ai: "AI paints a scene into your code. Every image is checked to scan.",
};

interface ArtPanelProps {
  styles: QRStyle;
  onChange: (styles: QRStyle) => void;
}

/**
 * The Art tab: Off, Logo QR and Image QR (vector art from the qrdx library,
 * saved with the design) and, where this deployment has it, AI art (an image
 * shown over the preview; components/editor/art/art-canvas.tsx).
 */
export function ArtPanel({ styles, onChange }: ArtPanelProps) {
  const configured = useArtSessionStore((state) => state.configured);
  const aiArt = useAvailability().has("aiArt") && configured;
  const picked = useArtSessionStore((state) => state.picked);
  const pick = useArtSessionStore((state) => state.pick);
  const vector = useVectorArt(styles, onChange);
  const mode = resolveArtMode(
    picked === "ai" && !aiArt ? null : picked,
    styles.art,
  );

  // Back from sign-in after pressing Generate: AI art, with the same form.
  usePostLoginAction(
    "AI_ART_GENERATE",
    useCallback((data?: unknown) => {
      const intent = parseArtGenerateIntent(data);
      if (!intent) return;
      const session = useArtSessionStore.getState();
      session.pick("ai");
      session.updateDraft(intent.draft);
      session.setResume(intent);
    }, []),
  );

  const choose = (next: string) => {
    if (!next || next === mode) return;
    if (next === "off") vector.removeArt();
    else if (next === "ai") pick("ai");
    else vector.chooseMode(next as QRArtMode);
  };

  return (
    <div className="space-y-4 px-4 pt-4 pb-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">Art</h2>
          <InfoHint id="art" />
        </div>
        <p className="text-muted-foreground text-xs text-pretty">
          {MODE_COPY[mode]}
        </p>
      </div>

      <ToggleGroup
        aria-label="Art mode"
        className="w-full"
        onValueChange={choose}
        type="single"
        value={mode}
        variant="outline"
      >
        <ToggleGroupItem className="flex-1 px-1 text-xs" value="off">
          Off
        </ToggleGroupItem>
        <ToggleGroupItem className="flex-1 px-1 text-xs" value="logo">
          Logo QR
        </ToggleGroupItem>
        <ToggleGroupItem className="flex-1 px-1 text-xs" value="halftone">
          Image QR
        </ToggleGroupItem>
        {aiArt && (
          <ToggleGroupItem className="flex-1 px-1 text-xs" value="ai">
            AI art
          </ToggleGroupItem>
        )}
      </ToggleGroup>

      {mode === "ai" ? (
        <AIArtPanel style={styles} />
      ) : mode === "off" ? null : (
        <ArtControls
          mode={mode}
          onChange={onChange}
          styles={styles}
          vector={vector}
        />
      )}
    </div>
  );
}
