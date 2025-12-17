/** biome-ignore-all lint/suspicious/noArrayIndexKey: false positive */

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@repo/design-system/components/ui/command";
import { Input } from "@repo/design-system/components/ui/input";
import { Kbd } from "@repo/design-system/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import { Separator } from "@repo/design-system/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Heart,
  Search,
  Settings,
  Shuffle,
} from "lucide-react";
import Link from "next/link";
import type { ColorConfig } from "qrdx";
import { normalizeColorConfig } from "qrdx/types";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useUserSettings } from "@/lib/hooks/use-user-settings";
import { useQREditorStore } from "@/store/editor-store";
import { useThemePresetStore } from "@/store/theme-preset-store";
import type { ThemePreset } from "@/types/theme";
import { getPresetThemeStyles } from "@/utils/qr-presets-helper";
import { ThemeToggle } from "../theme-toggle";
import { TooltipWrapper } from "../tooltip-wrapper";

interface ThemePresetSelectProps extends React.ComponentProps<typeof Button> {
  withCycleThemes?: boolean;
  disabled?: boolean;
}

interface ColorBoxProps {
  color: string | ColorConfig | undefined;
}

/**
 * Get CSS background style for a ColorConfig
 * Supports solid colors, linear gradients, and radial gradients
 */
function getColorBackgroundStyle(
  color: ColorConfig | string | undefined,
): React.CSSProperties {
  if (!color) {
    return { backgroundColor: "#000000" };
  }

  if (typeof color === "string") {
    return { backgroundColor: color };
  }

  const normalized = normalizeColorConfig(color);
  if (normalized.type === "solid") {
    return { backgroundColor: normalized.color };
  }

  // Generate gradient CSS
  const sortedStops = [...normalized.stops].sort((a, b) => a.offset - b.offset);
  const colorStops = sortedStops
    .map((stop) => `${stop.color} ${stop.offset}%`)
    .join(", ");

  if (normalized.type === "linear") {
    return {
      background: `linear-gradient(${normalized.angle ?? 0}deg, ${colorStops})`,
    };
  }

  return {
    background: `radial-gradient(circle, ${colorStops})`,
  };
}

const ColorBox: React.FC<ColorBoxProps> = ({ color }) => (
  <div
    className="border-muted h-3 w-3 rounded-sm border"
    style={getColorBackgroundStyle(color)}
  />
);

interface ThemeColorsProps {
  presetName: string;
}

const ThemeColors: React.FC<ThemeColorsProps> = ({ presetName }) => {
  const styles = getPresetThemeStyles(presetName);
  return (
    <div className="flex gap-0.5">
      {styles.bgColor && <ColorBox color={styles.bgColor} />}
      {styles.fgColor && <ColorBox color={styles.fgColor} />}
      {styles.eyeColor && <ColorBox color={styles.eyeColor} />}
      {styles.dotColor && <ColorBox color={styles.dotColor} />}
    </div>
  );
};

const isThemeNew = (preset: ThemePreset) => {
  if (!preset.createdAt) return false;
  const createdAt = new Date(preset.createdAt);
  const timePeriod = new Date();
  timePeriod.setDate(timePeriod.getDate() - 5);
  return createdAt > timePeriod;
};

const ThemeControls = () => {
  const applyThemePreset = useQREditorStore((store) => store.applyThemePreset);
  const presets = useThemePresetStore((store) => store.getAllPresets());

  const presetNames = useMemo(
    () => ["default", ...Object.keys(presets)],
    [presets],
  );

  const randomize = useCallback(() => {
    const random = Math.floor(Math.random() * presetNames.length);
    applyThemePreset(presetNames[random]);
  }, [presetNames, applyThemePreset]);

  return (
    <div className="flex gap-1">
      <ThemeToggle variant="ghost" size="icon" className="size-6 p-1" />

      <TooltipWrapper label="Random theme" kbd="T" asChild>
        <Button
          variant="ghost"
          size="sm"
          className="size-6 p-1"
          onClick={randomize}
        >
          <Shuffle className="h-3.5 w-3.5" />
        </Button>
      </TooltipWrapper>
    </div>
  );
};

interface ThemeCycleButtonProps extends React.ComponentProps<typeof Button> {
  direction: "prev" | "next";
}

const ThemeCycleButton: React.FC<ThemeCycleButtonProps> = ({
  direction,
  onClick,
  className,
  ...props
}) => {
  const { settings } = useUserSettings();
  const showKbd = settings?.keyboardShortcuts ?? true;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("aspect-square h-full shrink-0", className)}
          onClick={onClick}
          {...props}
        >
          {direction === "prev" ? (
            <ArrowLeft className="h-4 w-4" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex items-center gap-2">
          <span className="text-xs">
            {direction === "prev" ? "Previous theme" : "Next theme"}
          </span>
          {showKbd && <Kbd>{direction === "prev" ? "←" : "→"}</Kbd>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

interface ThemePresetCycleControlsProps
  extends React.ComponentProps<typeof Button> {
  filteredPresets: string[];
  currentPresetName: string;
  className?: string;
}

const ThemePresetCycleControls: React.FC<ThemePresetCycleControlsProps> = ({
  filteredPresets,
  currentPresetName,
  className,
  ...props
}) => {
  const applyThemePreset = useQREditorStore((store) => store.applyThemePreset);

  const currentIndex =
    useMemo(
      () => filteredPresets.indexOf(currentPresetName),
      [filteredPresets, currentPresetName],
    ) ?? 0;

  const cycleTheme = useCallback(
    (direction: "prev" | "next") => {
      const newIndex =
        direction === "next"
          ? (currentIndex + 1) % filteredPresets.length
          : (currentIndex - 1 + filteredPresets.length) %
            filteredPresets.length;
      applyThemePreset(filteredPresets[newIndex]);
    },
    [currentIndex, filteredPresets, applyThemePreset],
  );
  return (
    <>
      <Separator orientation="vertical" className="min-h-8 shrink-0" />

      <ThemeCycleButton
        direction="prev"
        size="icon"
        className={cn("aspect-square min-h-8 w-auto shrink-0", className)}
        onClick={() => cycleTheme("prev")}
        {...props}
      />

      <Separator orientation="vertical" className="min-h-8 shrink-0" />

      <ThemeCycleButton
        direction="next"
        size="icon"
        className={cn("aspect-square min-h-8 w-auto shrink-0", className)}
        onClick={() => cycleTheme("next")}
        {...props}
      />
    </>
  );
};

const ThemePresetSelect: React.FC<ThemePresetSelectProps> = ({
  withCycleThemes = true,
  className,
  ...props
}) => {
  const themeState = useQREditorStore((store) => store.themeState);
  const applyThemePreset = useQREditorStore((store) => store.applyThemePreset);
  const hasUnsavedChanges = useQREditorStore(
    (store) => store.hasUnsavedChanges,
  );
  const currentPreset = themeState.preset;

  const presets = useThemePresetStore((store) => store.getAllPresets());
  const loadSavedPresets = useThemePresetStore(
    (store) => store.loadSavedPresets,
  );
  const unloadSavedPresets = useThemePresetStore(
    (store) => store.unloadSavedPresets,
  );

  const [search, setSearch] = useState("");

  const { data: session } = authClient.useSession();

  useEffect(() => {
    if (session?.user) {
      loadSavedPresets();
    } else {
      unloadSavedPresets();
    }
  }, [loadSavedPresets, unloadSavedPresets, session?.user]);

  const isSavedTheme = useCallback(
    (presetId: string) => {
      return presets[presetId]?.source === "SAVED";
    },
    [presets],
  );

  const presetNames = useMemo(
    () => ["default", ...Object.keys(presets)],
    [presets],
  );
  const currentPresetName = presetNames?.find((name) => name === currentPreset);

  const filteredPresets = useMemo(() => {
    const filteredList =
      search.trim() === ""
        ? presetNames
        : presetNames.filter((name) => {
            if (name === "default") {
              return "default".toLowerCase().includes(search.toLowerCase());
            }
            return presets[name]?.label
              ?.toLowerCase()
              .includes(search.toLowerCase());
          });

    // Separate saved and default themes
    const savedThemesList = filteredList.filter(
      (name) => name !== "default" && isSavedTheme(name),
    );
    const defaultThemesList = filteredList.filter(
      (name) => !savedThemesList.includes(name),
    );

    // Sort each list, with "default" at the top for default themes
    const sortThemes = (list: string[]) => {
      const defaultTheme = list.filter((name) => name === "default");
      const otherThemes = list
        .filter((name) => name !== "default")
        .sort((a, b) => {
          const labelA = presets[a]?.label || a;
          const labelB = presets[b]?.label || b;
          return labelA.localeCompare(labelB);
        });
      return [...defaultTheme, ...otherThemes];
    };

    // Combine saved themes first, then default themes
    return [...sortThemes(savedThemesList), ...sortThemes(defaultThemesList)];
  }, [presetNames, search, presets, isSavedTheme]);

  const filteredSavedThemes = useMemo(() => {
    return filteredPresets.filter(
      (name) => name !== "default" && isSavedTheme(name),
    );
  }, [filteredPresets, isSavedTheme]);

  const filteredDefaultThemes = useMemo(() => {
    return filteredPresets.filter(
      (name) => name === "default" || !isSavedTheme(name),
    );
  }, [filteredPresets, isSavedTheme]);

  return (
    <div className="flex w-full items-center gap-0">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "group relative flex-1 justify-between md:min-w-56",
              className,
            )}
            {...props}
          >
            <div className="flex w-full items-center gap-3 overflow-hidden">
              <div className="flex gap-0.5">
                {themeState.styles.bgColor && (
                  <ColorBox color={themeState.styles.bgColor} />
                )}
                {themeState.styles.fgColor && (
                  <ColorBox color={themeState.styles.fgColor} />
                )}
                {themeState.styles.eyeColor && (
                  <ColorBox color={themeState.styles.eyeColor} />
                )}
                {themeState.styles.dotColor && (
                  <ColorBox color={themeState.styles.dotColor} />
                )}
              </div>
              {currentPresetName !== "default" &&
                currentPresetName &&
                isSavedTheme(currentPresetName) &&
                !hasUnsavedChanges() && (
                  <div className="bg-muted rounded-full p-1">
                    <Heart
                      className="size-1"
                      stroke="var(--muted)"
                      fill="var(--muted-foreground)"
                    />
                  </div>
                )}
              <span className="truncate text-left font-medium capitalize">
                {hasUnsavedChanges() ? (
                  <>Custom (Unsaved)</>
                ) : (
                  presets[currentPresetName || "default"]?.label
                )}
              </span>
            </div>
            <ChevronDown className="size-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="center">
          <Command className="h-100 w-full">
            <div className="flex w-full items-center">
              <div className="flex w-full items-center border-b px-3 py-1">
                <Search className="size-4 shrink-0 opacity-50" />
                <Input
                  placeholder="Search themes..."
                  className="border-0 shadow-none bg-transparent! focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <div className="text-muted-foreground text-sm">
                {filteredPresets.length} theme
                {filteredPresets.length !== 1 ? "s" : ""}
              </div>
              <ThemeControls />
            </div>
            <Separator />
            <ScrollArea className="h-[500px] max-h-[70vh]">
              <CommandEmpty>No themes found.</CommandEmpty>

              {/* Saved Themes Group */}
              {filteredSavedThemes.length > 0 && (
                <>
                  <CommandGroup
                    heading={
                      <div className="flex w-full items-center justify-between">
                        <span>Saved Themes</span>
                        <Link href="/settings/themes">
                          <Button
                            variant="link"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 p-0 text-xs"
                          >
                            <span>Manage</span>
                            <Settings className="size-3.5!" />
                          </Button>
                        </Link>
                      </div>
                    }
                  >
                    {filteredSavedThemes
                      .filter(
                        (name) => name !== "default" && isSavedTheme(name),
                      )
                      .map((presetName, index) => (
                        <CommandItem
                          key={`${presetName}-${index}`}
                          value={`${presetName}-${index}`}
                          onSelect={() => {
                            applyThemePreset(presetName);
                            setSearch("");
                          }}
                          className="data-highlighted:bg-secondary/50 flex items-center gap-2 py-2"
                        >
                          <ThemeColors presetName={presetName} />
                          <div className="flex flex-1 items-center gap-2">
                            <span className="line-clamp-1 text-sm font-medium capitalize">
                              {presets[presetName]?.label || presetName}
                            </span>
                            {presets[presetName] &&
                              isThemeNew(presets[presetName]) && (
                                <Badge
                                  variant="secondary"
                                  className="rounded-full text-xs"
                                >
                                  New
                                </Badge>
                              )}
                          </div>
                          {presetName === currentPresetName && (
                            <Check className="h-4 w-4 shrink-0 opacity-70" />
                          )}
                        </CommandItem>
                      ))}
                  </CommandGroup>
                  <Separator className="my-2" />
                </>
              )}

              {filteredSavedThemes.length === 0 && search.trim() === "" && (
                <>
                  <div className="text-muted-foreground flex items-center gap-1.5 px-3 py-2 text-xs font-medium">
                    <div className="bg-muted flex items-center gap-1 rounded-md border px-2 py-0.5">
                      <Heart className="fill-muted-foreground size-3" />
                      <span>Save</span>
                    </div>
                    <span className="text-muted-foreground">
                      a theme to find it here.
                    </span>
                  </div>
                  <Separator />
                </>
              )}

              {/* Default Theme Group */}
              {filteredDefaultThemes.length > 0 && (
                <CommandGroup heading="Built-in Themes">
                  {filteredDefaultThemes.map((presetName, index) => (
                    <CommandItem
                      key={`${presetName}-${index}`}
                      value={`${presetName}-${index}`}
                      onSelect={() => {
                        applyThemePreset(presetName);
                        setSearch("");
                      }}
                      className="data-highlighted:bg-secondary/50 flex items-center gap-2 py-2"
                    >
                      <ThemeColors presetName={presetName} />
                      <div className="flex flex-1 items-center gap-2">
                        <span className="text-sm font-medium capitalize">
                          {presets[presetName]?.label || presetName}
                        </span>
                        {presets[presetName] &&
                          isThemeNew(presets[presetName]) && (
                            <Badge
                              variant="secondary"
                              className="rounded-full text-xs"
                            >
                              New
                            </Badge>
                          )}
                      </div>
                      {presetName === currentPresetName && (
                        <Check className="h-4 w-4 shrink-0 opacity-70" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </ScrollArea>
          </Command>
        </PopoverContent>
      </Popover>

      {withCycleThemes && (
        <ThemePresetCycleControls
          filteredPresets={filteredPresets}
          currentPresetName={currentPresetName || "default"}
          className={className}
          disabled={props.disabled}
        />
      )}
    </div>
  );
};

export default ThemePresetSelect;
