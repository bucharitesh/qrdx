"use client";

import { Button } from "@repo/design-system/components/ui/button";
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
        return ["Try a different style", "Keep the colours, change the shapes"];
      }
      return [];
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

export function SuggestionChips({
  suggestions,
  onPick,
  disabled,
}: {
  suggestions: string[];
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  if (suggestions.length === 0) return null;
  return (
    <fieldset
      aria-label="Suggestions"
      className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0 pl-11"
    >
      {suggestions.map((suggestion) => (
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
      ))}
    </fieldset>
  );
}
