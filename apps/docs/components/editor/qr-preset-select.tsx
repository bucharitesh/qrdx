/** biome-ignore-all lint/suspicious/noArrayIndexKey: false positive */

import { Tick as Check } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@repo/design-system/components/ui/command";
import { Input } from "@repo/design-system/components/ui/input";
import { Kbd } from "@repo/design-system/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { Separator } from "@repo/design-system/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowDown2,
  ArrowLeft,
  ArrowRight,
  Element3,
  Heart,
  SearchNormal1,
  Setting2 as Settings,
  Shuffle,
} from "iconsax-reactjs";
import Link from "next/link";
import { type ColorConfig, getColorString } from "qrdx";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { seasonalPresetsFirst } from "@/components/seasonal/preset-order";
import { useMounted } from "@/lib/hooks/use-mounted";
import { shuffleNext } from "@/lib/hooks/use-theme-shuffle";
import { useUserSettings } from "@/lib/hooks/use-user-settings";
import { soundEvent } from "@/lib/sound/emit";
import { isShuffleId } from "@/lib/themes/shuffle";
import { useQREditorStore } from "@/store/editor-store";
import { useThemePresetStore } from "@/store/theme-preset-store";
import type { ThemePreset } from "@/types/theme";
import {
  getPresetLabel,
  getPresetThemeStyles,
} from "@/utils/qr-presets-helper";
import { ThemeToggle } from "../theme-toggle";
import { TooltipWrapper } from "../tooltip-wrapper";
import { ThemeGallery } from "./theme-gallery";
import { useSavedThemes } from "./use-saved-themes";

interface ThemePresetSelectProps extends React.ComponentProps<typeof Button> {
  withCycleThemes?: boolean;
  disabled?: boolean;
}

interface ColorBoxProps {
  color: ColorConfig | string | undefined;
}

const ColorBox: React.FC<ColorBoxProps> = ({ color }) => (
  <div
    className="border-muted h-3 w-3 rounded-sm border"
    style={{ backgroundColor: getColorString(color) }}
  />
);

interface ThemeColorsProps {
  presetName: string;
}

const ThemeColors: React.FC<ThemeColorsProps> = ({ presetName }) => {
  const styles = getPresetThemeStyles(presetName);
  return (
    <div className="flex gap-0.5">
      <ColorBox color={styles.bgColor} />
      <ColorBox color={styles.fgColor} />
      <ColorBox color={styles.eyeColor} />
      <ColorBox color={styles.dotColor} />
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
  // A new theme from the generator's palettes and shape rules, not a preset.
  const randomize = useCallback(() => {
    shuffleNext();
    soundEvent("shuffle");
  }, []);

  return (
    <div className="flex gap-1">
      <ThemeToggle variant="ghost" size="icon" className="size-6 p-1" />

      <TooltipWrapper label="Shuffle a new theme" kbd="T" asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Shuffle a new theme"
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
          aria-label={direction === "prev" ? "Previous theme" : "Next theme"}
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
          {showKbd && <Kbd>{direction === "prev" ? "<" : ">"}</Kbd>}
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
      () => filteredPresets.indexOf(currentPresetName || "default"),
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
      soundEvent("apply");
    },
    [currentIndex, filteredPresets, applyThemePreset],
  );
  return (
    <>
      <Separator orientation="vertical" className="min-h-8 shrink-0" />

      <ThemeCycleButton
        direction="prev"
        size="icon"
        className={cn("aspect-square min-h-8 w-auto", className)}
        onClick={() => cycleTheme("prev")}
        {...props}
      />

      <Separator orientation="vertical" className="min-h-8 shrink-0" />

      <ThemeCycleButton
        direction="next"
        size="icon"
        className={cn("aspect-square min-h-8 w-auto", className)}
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
  const defaultPresetId = useThemePresetStore((store) => store.defaultPresetId);

  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const isMounted = useMounted();

  useSavedThemes();

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
    return [
      ...sortThemes(savedThemesList),
      ...seasonalPresetsFirst(sortThemes(defaultThemesList)),
    ];
  }, [presetNames, search, presets, isSavedTheme]);

  const filteredSavedThemes = useMemo(() => {
    return filteredPresets.filter(
      (name) => name !== "default" && isSavedTheme(name),
    );
  }, [filteredPresets, isSavedTheme]);

  // Team themes (shared with the active team) above your personal ones.
  const savedThemeGroups = useMemo(() => {
    const team = filteredSavedThemes.filter(
      (name) => presets[name]?.scope === "team",
    );
    const personal = filteredSavedThemes.filter(
      (name) => presets[name]?.scope !== "team",
    );
    return [
      { heading: "Team themes", names: team },
      {
        heading: team.length > 0 ? "Your themes" : "Saved themes",
        names: personal,
      },
    ].filter((group) => group.names.length > 0);
  }, [filteredSavedThemes, presets]);

  const filteredDefaultThemes = useMemo(() => {
    return filteredPresets.filter(
      (name) => name === "default" || !isSavedTheme(name),
    );
  }, [filteredPresets, isSavedTheme]);

  return (
    <div className="flex w-full items-center">
      <div className="flex-1 min-w-0">
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "group relative w-full justify-between md:min-w-56",
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
                  {(isShuffleId(currentPreset) &&
                    getPresetLabel(currentPreset)) ||
                    presets[currentPresetName || "default"]?.label ||
                    currentPresetName ||
                    "default"}
                  {isMounted && hasUnsavedChanges() && "*"}
                </span>
              </div>
              <ArrowDown2 className="size-4 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="center">
            <Command className="w-full">
              <div className="flex w-full items-center">
                <div className="flex w-full items-center border-b px-3 py-1">
                  <SearchNormal1 className="size-4 shrink-0 opacity-50" />
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
                <div className="flex items-center gap-1">
                  <Button
                    className="text-muted-foreground hover:text-foreground h-6 gap-1 px-2 text-xs"
                    onClick={() => {
                      setMenuOpen(false);
                      setGalleryOpen(true);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    <Element3 className="size-3.5" />
                    Browse all
                  </Button>
                  <ThemeControls />
                </div>
              </div>
              <Separator />
              <CommandList className="max-h-[500px]">
                <CommandEmpty>No themes found.</CommandEmpty>

                {/* Saved Themes Groups */}
                {savedThemeGroups.map((group, groupIndex) => (
                  <CommandGroup
                    key={group.heading}
                    heading={
                      <div className="flex w-full items-center justify-between">
                        <span>{group.heading}</span>
                        {groupIndex === 0 && (
                          <Link href="/dashboard/themes">
                            <Button
                              variant="link"
                              size="sm"
                              className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 p-0 text-xs"
                            >
                              <span>Manage</span>
                              <Settings className="size-3.5!" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    }
                  >
                    {group.names.map((presetName, index) => (
                      <CommandItem
                        key={`${presetName}-${index}`}
                        value={`${presetName}-${index}`}
                        onSelect={() => {
                          applyThemePreset(presetName);
                          soundEvent("apply");
                          setSearch("");
                        }}
                        className="data-highlighted:bg-secondary/50 flex items-center gap-2 py-2"
                      >
                        <ThemeColors presetName={presetName} />
                        <div className="flex flex-1 items-center gap-2">
                          <span className="line-clamp-1 text-sm font-medium capitalize">
                            {presets[presetName]?.label || presetName}
                          </span>
                          {presetName === defaultPresetId ? (
                            <Badge
                              variant="outline"
                              className="rounded-full text-xs"
                            >
                              Default
                            </Badge>
                          ) : (
                            presets[presetName] &&
                            isThemeNew(presets[presetName]) && (
                              <Badge
                                variant="secondary"
                                className="rounded-full text-xs"
                              >
                                New
                              </Badge>
                            )
                          )}
                        </div>
                        {presetName === currentPresetName && (
                          <Check className="h-4 w-4 shrink-0 opacity-70" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
                {savedThemeGroups.length > 0 && <Separator className="my-2" />}

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
                          soundEvent("apply");
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
                <Separator className="my-1" />
                <div className="px-3 py-2">
                  <Link href="/community">
                    <Button
                      variant="link"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground w-full justify-center text-xs"
                    >
                      Discover more themes →
                    </Button>
                  </Link>
                </div>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <ThemeGallery onOpenChange={setGalleryOpen} open={galleryOpen} />
      </div>

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
