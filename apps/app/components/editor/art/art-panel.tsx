"use client";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import { useTranslations } from "next-intl";
import type { QRArtMode } from "qrdx/types";
import { useCallback } from "react";
import { useAvailability } from "@/components/availability-provider";
import {
  ArtControls,
  useVectorArt,
} from "@/components/editor/control-sections/art-controls";
import { InfoHint } from "@/components/help/info-hint";
import { usePostLoginAction } from "@/lib/hooks/use-post-login-action";
import { resolveArtMode, useArtSessionStore } from "@/store/art-session-store";
import type { QRStyle } from "@/types/theme";
import { parseArtGenerateIntent } from "./ai-art-intent";
import { AIArtPanel } from "./ai-art-panel";

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
  const t = useTranslations("editor.art.artPanel");
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
          <h2 className="text-sm font-medium">{t("art")}</h2>
          <InfoHint id="art" />
        </div>
        <p className="text-muted-foreground text-xs text-pretty">
          {t(`modes.${mode}`)}
        </p>
      </div>

      <ToggleGroup
        aria-label={t("artMode")}
        className="w-full"
        onValueChange={choose}
        type="single"
        value={mode}
        variant="outline"
      >
        <ToggleGroupItem className="flex-1 px-1 text-xs" value="off">
          {t("off")}
        </ToggleGroupItem>
        <ToggleGroupItem className="flex-1 px-1 text-xs" value="logo">
          {t("logoQr")}
        </ToggleGroupItem>
        <ToggleGroupItem className="flex-1 px-1 text-xs" value="halftone">
          {t("imageQr")}
        </ToggleGroupItem>
        {aiArt && (
          <ToggleGroupItem className="flex-1 px-1 text-xs" value="ai">
            {t("aiArt")}
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
