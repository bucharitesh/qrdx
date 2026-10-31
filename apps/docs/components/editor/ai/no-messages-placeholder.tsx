"use client";

import { authClient } from "@repo/auth/client";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { Blend, Clock, Magicpen, MagicStar } from "iconsax-reactjs";
import { QRCodeSVG } from "qrdx";
import { useEffect, useState } from "react";
import { getClientSeason } from "@/lib/seasonal";
import { soundEvent } from "@/lib/sound/emit";
import { useQREditorStore } from "@/store/editor-store";
import type { AIPromptData } from "@/types/ai";
import {
  createCurrentThemePrompt,
  createPromptDataFromPreset,
} from "@/utils/ai/ai-prompt";
import { applyGeneratedTheme } from "@/utils/ai/apply-theme";
import { REMIX_PROMPTS, VARIANT_PROMPTS } from "@/utils/ai/prompts";
import { getPresetThemeStyles } from "@/utils/qr-presets-helper";
import { AIHero } from "./ai-hero";
import { PromptCard } from "./prompt-card";
import {
  CREATE_SUGGESTIONS,
  MODE_DESCRIPTIONS,
  type PromptSuggestion,
} from "./prompt-suggestions";
import { useRecentGenerations } from "./recent-generations";

type Mode = keyof typeof MODE_DESCRIPTIONS;

const MODES: { id: Mode; label: string; Icon: typeof MagicStar }[] = [
  { id: "create", label: "Create", Icon: MagicStar },
  { id: "remix", label: "Remix", Icon: Blend },
  { id: "tweak", label: "Tweak", Icon: Magicpen },
];

/** "@Modern" → "Modern", "@Current Style" → "your style". */
function cleanTitle(text: string) {
  return text.replace(/@Current Style/g, "your style").replace(/@/g, "");
}

const grid =
  "grid grid-cols-1 gap-2 @[22rem]:grid-cols-2 @[22rem]:[&>*:last-child:nth-child(odd)]:col-span-2";

export function NoMessagesPlaceholder({
  onGenerateTheme,
  isGeneratingTheme,
}: {
  onGenerateTheme: (promptData: AIPromptData) => void;
  isGeneratingTheme: boolean;
}) {
  const { data: session } = authClient.useSession();
  const userName = session?.user.name?.split(" ")[0];
  const greeting = `What can I help you theme${userName ? `, ${userName}` : ""}?`;
  const [mode, setMode] = useState<Mode>("create");
  const currentStyles = useQREditorStore((state) => state.themeState.styles);
  const recent = useRecentGenerations();

  // Seasonal ideas only while the season is on (client date + overrides).
  const [season, setSeason] = useState<string | null>(null);
  useEffect(() => {
    setSeason(getClientSeason());
  }, []);
  const createIdeas = CREATE_SUGGESTIONS.filter(
    (idea: PromptSuggestion) => !idea.season || idea.season === season,
  );

  return (
    <div className="@container mx-auto flex w-full max-w-lg flex-col gap-6">
      <AIHero greeting={greeting} thinking={isGeneratingTheme} />

      <Tabs
        className="gap-3"
        onValueChange={(next) => setMode(next as Mode)}
        value={mode}
      >
        <div className="space-y-2">
          <TabsList className="grid h-9 w-full grid-cols-3">
            {MODES.map(({ id, label, Icon }) => (
              <TabsTrigger className="gap-1.5" key={id} value={id}>
                <Icon className="size-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <p aria-live="polite" className="text-muted-foreground px-1 text-xs">
            {MODE_DESCRIPTIONS[mode]}
          </p>
        </div>

        <TabsContent className="mt-0" value="create">
          <div className={grid}>
            {createIdeas.map((idea) => (
              <PromptCard
                disabled={isGeneratingTheme}
                hint={idea.hint}
                key={idea.id}
                onClick={() =>
                  onGenerateTheme({ content: idea.prompt, mentions: [] })
                }
                preview={idea.preview}
                title={idea.title}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent className="mt-0" value="remix">
          <div className={grid}>
            {REMIX_PROMPTS.map((prompt) => (
              <PromptCard
                disabled={isGeneratingTheme}
                hint={`Remix of ${prompt.basePreset}`}
                key={prompt.displayContent}
                onClick={() =>
                  onGenerateTheme(
                    createPromptDataFromPreset(
                      prompt.prompt,
                      prompt.basePreset,
                    ),
                  )
                }
                preview={getPresetThemeStyles(prompt.basePreset)}
                title={cleanTitle(prompt.displayContent)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent className="mt-0" value="tweak">
          <div className={grid}>
            {VARIANT_PROMPTS.map((prompt) => (
              <PromptCard
                disabled={isGeneratingTheme}
                hint="Starts from your current design"
                key={prompt.displayContent}
                onClick={() =>
                  onGenerateTheme(
                    createCurrentThemePrompt({ prompt: prompt.prompt }),
                  )
                }
                preview={currentStyles}
                title={cleanTitle(prompt.displayContent)}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {recent.length > 0 && (
        <section aria-labelledby="ai-recent-title" className="space-y-2">
          <h3
            className="text-muted-foreground flex items-center gap-1.5 px-1 text-xs font-medium"
            id="ai-recent-title"
          >
            <Clock className="size-3.5" />
            Recent generations
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {recent.map((item) => (
              <button
                aria-label={
                  item.prompt
                    ? `Apply: ${item.prompt.slice(0, 60)}`
                    : "Apply this generated theme"
                }
                className="hover:ring-foreground/30 focus-visible:ring-ring/50 grid size-12 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white p-0.5 ring-1 ring-black/10 transition-[box-shadow,transform] outline-none hover:-translate-y-0.5 focus-visible:ring-[3px] [&_svg]:size-full"
                key={item.id}
                onClick={() => {
                  applyGeneratedTheme(item.styles);
                  soundEvent("apply");
                }}
                title={item.prompt}
                type="button"
              >
                <QRCodeSVG
                  bgColor={item.styles.bgColor}
                  bodyPattern={item.styles.bodyPattern}
                  cornerEyeDotPattern={item.styles.cornerEyeDotPattern}
                  cornerEyePattern={item.styles.cornerEyePattern}
                  dotColor={item.styles.dotColor}
                  eyeColor={item.styles.eyeColor}
                  fgColor={item.styles.fgColor}
                  level="L"
                  margin={1}
                  size={48}
                  value="qrdx.dev"
                />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
