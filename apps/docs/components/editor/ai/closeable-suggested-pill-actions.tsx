"use client";

import { Close as X } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { useMounted } from "@/lib/hooks/use-mounted";
import { usePreferencesStore } from "@/store/preferences-store";
import type { AIPromptData } from "@/types/ai";
import { createCurrentThemePrompt } from "@/utils/ai/ai-prompt";
import { PROMPTS } from "@/utils/ai/prompts";
import { PillActionButton } from "./pill-action-button";
import { PromptSwatch } from "./prompt-swatch";

export function ClosableSuggestedPillActions({
  onGenerateTheme,
  isGeneratingTheme,
}: {
  onGenerateTheme: (promptData: AIPromptData) => void;
  isGeneratingTheme: boolean;
}) {
  const { chatSuggestionsOpen, setChatSuggestionsOpen } = usePreferencesStore();
  const isMounted = useMounted();

  const handleSetPrompt = async (prompt: string) => {
    const promptData = createCurrentThemePrompt({ prompt });
    onGenerateTheme(promptData);
  };

  if (!isMounted || !chatSuggestionsOpen) return null;

  return (
    <div className="relative flex flex-col items-center justify-center">
      <div className="text-muted-foreground flex w-full items-center justify-between gap-4">
        <h3 className="text-xs">Suggestions</h3>
        <Button
          aria-label="Hide suggestions"
          variant="ghost"
          size="icon-sm"
          className="size-6 [&>svg]:size-3.5"
          onClick={() => setChatSuggestionsOpen(false)}
        >
          <X />
        </Button>
      </div>

      <div className="-mx-4 flex w-[calc(100%+2rem)] snap-x gap-2 overflow-x-auto scroll-px-4 px-4 pt-1 pb-2 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-32px),transparent)] [scrollbar-width:none] [&>*]:snap-start">
        {Object.entries(PROMPTS).map(([key, { label, prompt, swatch }]) => (
          <PillActionButton
            key={key}
            onClick={() => handleSetPrompt(prompt)}
            disabled={isGeneratingTheme}
          >
            <PromptSwatch swatch={swatch} /> {label}
          </PillActionButton>
        ))}
      </div>
    </div>
  );
}
