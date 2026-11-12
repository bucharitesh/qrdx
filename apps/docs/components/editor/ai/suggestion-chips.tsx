"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useTranslations } from "next-intl";
import { getSolidColor } from "qrdx/types";
import { luminance } from "@/lib/themes/color";
import type { ChatMessage } from "@/types/ai";
import type { ThemeStyles } from "@/types/theme";

// Next steps after a result ("Make it darker", "Add a frame"): the agent's
// own suggestions for an applied design, topped up with ones that fit it.

const MAX_CHIPS = 3;

function fitting(styles: ThemeStyles | undefined): string[] {
  if (!styles) return ["Try a different style"];
  const background = getSolidColor(styles.bgColor, "#ffffff");
  const light =
    typeof background !== "string" || (luminance(background) ?? 1) > 0.4;
  return [
    styles.frame && styles.frame.style !== "none"
      ? "Change the frame text"
      : "Add a frame with “Scan me”",
    light ? "Make it darker" : "Make it lighter",
    styles.showLogo ? "Remove the logo" : "Add a logo",
    "Save it as a template",
  ];
}

/** Chips for the last assistant message, or none while it isn't a result. */
export function suggestionsFor(message: ChatMessage | undefined): string[] {
  if (message?.role !== "assistant") return [];
  for (const part of [...message.parts].reverse()) {
    if (part.type === "tool-apply_design") {
      if (part.state === "output-available" && part.output.ok) {
        const own = part.output.followups;
        return [
          ...new Set([...own, ...fitting(part.output.themeStyles)]),
        ].slice(0, MAX_CHIPS);
      }
      if (part.state === "output-denied") {
        return ["Try a different style", "Keep the colors, change the shapes"];
      }
      return [];
    }
    if (part.type === "tool-use_image" && part.state === "output-available") {
      if (part.output.as === "ai_art") return [];
      if (!part.output.applied) {
        return part.output.as === "logo"
          ? ["Put it behind the code instead"]
          : ["Use it as the logo instead"];
      }
      return [
        ...new Set([
          ...(part.input.followups ?? []),
          "Add a frame with “Scan me”",
          "Save it as a template",
        ]),
      ].slice(0, MAX_CHIPS);
    }
    if (
      part.type === "tool-save_template" &&
      part.state === "output-available"
    ) {
      return part.output.ok ? ["Make a variation", "Make a dark version"] : [];
    }
  }
  return [];
}

/**
 * QRdx's own chips (above) by their English: shown, and sent, in the page's
 * language (editor.ai.suggestionChips.chips). The model's follow-ups show
 * as it wrote them.
 */
const CHIP_KEYS: Record<string, string> = {
  "Try a different style": "differentStyle",
  "Change the frame text": "frameText",
  "Add a frame with “Scan me”": "addFrame",
  "Make it darker": "darker",
  "Make it lighter": "lighter",
  "Remove the logo": "removeLogo",
  "Add a logo": "addLogo",
  "Save it as a template": "saveTemplate",
  "Keep the colors, change the shapes": "keepColors",
  "Put it behind the code instead": "behindCode",
  "Use it as the logo instead": "asLogo",
  "Make a variation": "variation",
  "Make a dark version": "darkVersion",
};

export function SuggestionChips({
  suggestions,
  onPick,
  disabled,
}: {
  suggestions: string[];
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("editor.ai.suggestionChips");
  if (suggestions.length === 0) return null;
  return (
    <fieldset
      aria-label={t("suggestions")}
      className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0 pl-11"
    >
      {suggestions.map((english) => {
        const key = CHIP_KEYS[english];
        const suggestion = key
          ? t(`chips.${key}` as Parameters<typeof t>[0])
          : english;
        return (
          <Button
            className="text-muted-foreground hover:text-foreground h-7 rounded-full px-3 text-xs shadow-none"
            disabled={disabled}
            key={suggestion}
            onClick={() => onPick(suggestion)}
            size="sm"
            variant="outline"
          >
            {suggestion}
          </Button>
        );
      })}
    </fieldset>
  );
}
