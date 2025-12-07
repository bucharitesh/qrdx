"use client";

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import { Separator } from "@repo/design-system/components/ui/separator";
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
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { authClient } from "@/lib/auth-client";
import { useQRThemes } from "@/lib/hooks/use-qr-themes";
import { useQREditorStore } from "@/store/editor-store";
import type { QRPreset } from "@/types/qr";
import { builtInPresets } from "@/utils/qr-presets";

interface QRPresetSelectProps extends React.ComponentProps<typeof Button> {
  withCycleThemes?: boolean;
}

interface ColorBoxProps {
  color: string;
}

const ColorBox: React.FC<ColorBoxProps> = ({ color }) => (
  <div
    className="border-muted h-3 w-3 rounded-sm border"
    style={{ backgroundColor: color }}
  />
);

interface QRColorsProps {
  preset: QRPreset;
}

const QRColors: React.FC<QRColorsProps> = ({ preset }) => {
  return (
    <div className="flex gap-0.5">
      <ColorBox color={preset.style.bgColor || "#ffffff"} />
      <ColorBox color={preset.style.fgColor || "#000000"} />
      <ColorBox
        color={preset.style.eyeColor || preset.style.fgColor || "#000000"}
      />
      <ColorBox
        color={preset.style.dotColor || preset.style.fgColor || "#000000"}
      />
    </div>
  );
};

const isThemeNew = (preset: QRPreset) => {
  if (!preset.createdAt) return false;
  const createdAt = new Date(preset.createdAt);
  const timePeriod = new Date();
  timePeriod.setDate(timePeriod.getDate() - 5);
  return createdAt > timePeriod;
};

interface QRCycleButtonProps extends React.ComponentProps<typeof Button> {
  direction: "prev" | "next";
}

const QRCycleButton: React.FC<QRCycleButtonProps> = ({
  direction,
  onClick,
  className,
  ...props
}) => (
  <TooltipWrapper
    label={direction === "prev" ? "Previous theme" : "Next theme"}
    asChild
  >
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
  </TooltipWrapper>
);

interface QRPresetCycleControlsProps
  extends React.ComponentProps<typeof Button> {
  filteredPresets: QRPreset[];
  currentPresetId: string | undefined;
  className?: string;
}

const QRPresetCycleControls: React.FC<QRPresetCycleControlsProps> = ({
  filteredPresets,
  currentPresetId,
  className,
  ...props
}) => {
  const { applyPreset } = useQREditorStore();

  const currentIndex = useMemo(() => {
    const index = filteredPresets.findIndex((p) => p.id === currentPresetId);
    return index >= 0 ? index : 0;
  }, [filteredPresets, currentPresetId]);

  const cyclePreset = useCallback(
    (direction: "prev" | "next") => {
      if (filteredPresets.length === 0) return;
      const newIndex =
        direction === "next"
          ? (currentIndex + 1) % filteredPresets.length
          : (currentIndex - 1 + filteredPresets.length) %
            filteredPresets.length;
      applyPreset(filteredPresets[newIndex]);
    },
    [currentIndex, filteredPresets, applyPreset],
  );

  return (
    <>
      <Separator orientation="vertical" className="min-h-8" />
      <QRCycleButton
        direction="prev"
        size="icon"
        className={cn("aspect-square min-h-8 w-auto", className)}
        onClick={() => cyclePreset("prev")}
        {...props}
      />
      <Separator orientation="vertical" className="min-h-8" />
      <QRCycleButton
        direction="next"
        size="icon"
        className={cn("aspect-square min-h-8 w-auto", className)}
        onClick={() => cyclePreset("next")}
        {...props}
      />
    </>
  );
};

const QRControls = () => {
  const { applyPreset } = useQREditorStore();
  const allPresets = builtInPresets;

  const randomize = useCallback(() => {
    const random = Math.floor(Math.random() * allPresets.length);
    applyPreset(allPresets[random]);
  }, [allPresets, applyPreset]);

  return (
    <div className="flex gap-1">
      <ThemeToggle variant="ghost" size="icon" className="size-6 p-1" />
      <TooltipWrapper label="Random QR style" asChild>
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

const QRPresetSelect: React.FC<QRPresetSelectProps> = ({
  withCycleThemes = true,
  className,
  ...props
}) => {
  const { style, currentPreset, applyPreset, hasUnsavedChanges } =
    useQREditorStore();
  const [search, setSearch] = useState("");
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by only checking unsaved changes after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: session } = authClient.useSession();
  // Only fetch saved themes if user is logged in
  const { data: savedThemes = [] } = useQRThemes();

  // Filter saved themes only if authenticated
  const userSavedThemes = session?.user ? savedThemes : [];

  // Combine built-in and saved themes
  const allPresets = useMemo(() => {
    const saved = userSavedThemes.map((theme) => ({
      id: theme.id,
      name: theme.name,
      description: theme.description || "",
      source: "SAVED" as const,
      createdAt: theme.createdAt.toISOString(),
      style: theme.style,
    }));
    return [...builtInPresets, ...saved];
  }, [userSavedThemes]);

  const isSavedTheme = useCallback(
    (presetId: string) => {
      return allPresets.find((p) => p.id === presetId)?.source === "SAVED";
    },
    [allPresets],
  );

  const currentPresetId = currentPreset?.id;

  const filteredPresets = useMemo(() => {
    const filteredList =
      search.trim() === ""
        ? allPresets
        : allPresets.filter((preset) =>
            preset.name.toLowerCase().includes(search.toLowerCase()),
          );

    // Separate saved and built-in themes
    const savedThemesList = filteredList.filter((p) => p.source === "SAVED");
    const builtInThemesList = filteredList.filter(
      (p) => p.source === "BUILT_IN",
    );

    return [...savedThemesList, ...builtInThemesList];
  }, [allPresets, search]);

  const filteredSavedThemes = useMemo(() => {
    return filteredPresets.filter((p) => p.source === "SAVED");
  }, [filteredPresets]);

  const filteredBuiltInThemes = useMemo(() => {
    return filteredPresets.filter((p) => p.source === "BUILT_IN");
  }, [filteredPresets]);

  return (
    <div className="flex w-full items-center">
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
                <ColorBox color={style.bgColor || "#ffffff"} />
                <ColorBox color={style.fgColor || "#000000"} />
                <ColorBox
                  color={style.eyeColor || style.fgColor || "#000000"}
                />
                <ColorBox
                  color={style.dotColor || style.fgColor || "#000000"}
                />
              </div>
              {mounted &&
                currentPresetId &&
                isSavedTheme(currentPresetId) &&
                !hasUnsavedChanges() && (
                  <div className="bg-muted rounded-full p-1">
                    <Heart
                      className="size-3"
                      stroke="var(--muted)"
                      fill="var(--muted-foreground)"
                    />
                  </div>
                )}
              <span className="truncate text-left font-medium capitalize">
                {mounted && hasUnsavedChanges() ? (
                  <>Custom (Unsaved)</>
                ) : (
                  currentPreset?.name || "Classic"
                )}
              </span>
            </div>
            <ChevronDown className="size-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="center">
          <Command className="flex h-full max-h-[70vh] flex-col">
            <div className="flex w-full items-center">
              <div className="flex w-full items-center border-b px-3 py-1">
                <Search className="size-4 shrink-0 opacity-50" />
                <Input
                  placeholder="Search QR styles..."
                  className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <div className="text-muted-foreground text-sm">
                {filteredPresets.length} style
                {filteredPresets.length !== 1 ? "s" : ""}
              </div>
              <QRControls />
            </div>
            <Separator />
            <CommandList className="max-h-[500px]">
              <CommandEmpty>No QR styles found.</CommandEmpty>

              {/* Saved Themes Group */}
              {filteredSavedThemes.length > 0 && (
                <>
                  <CommandGroup
                    heading={
                      <div className="flex w-full items-center justify-between">
                        <span>Saved Themes</span>
                        <Link href="/settings/qr-themes">
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
                    {filteredSavedThemes.map((preset, index) => (
                      <CommandItem
                        key={`${preset.id}-${index}`}
                        value={`${preset.id}-${index}`}
                        onSelect={() => {
                          applyPreset(preset);
                          setSearch("");
                        }}
                        className="data-[highlighted]:bg-secondary/50 flex items-center gap-2 py-2"
                      >
                        <QRColors preset={preset} />
                        <div className="flex flex-1 items-center gap-2">
                          <span className="line-clamp-1 text-sm font-medium">
                            {preset.name}
                          </span>
                          {isThemeNew(preset) && (
                            <Badge
                              variant="secondary"
                              className="rounded-full text-xs"
                            >
                              New
                            </Badge>
                          )}
                        </div>
                        {preset.id === currentPresetId && (
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
                      a QR theme to find it here.
                    </span>
                  </div>
                  <Separator />
                </>
              )}

              {/* Built-in Themes Group */}
              {filteredBuiltInThemes.length > 0 && (
                <CommandGroup heading="Built-in Styles">
                  {filteredBuiltInThemes.map((preset, index) => (
                    <CommandItem
                      key={`${preset.id}-${index}`}
                      value={`${preset.id}-${index}`}
                      onSelect={() => {
                        applyPreset(preset);
                        setSearch("");
                      }}
                      className="data-[highlighted]:bg-secondary/50 flex items-center gap-2 py-2"
                    >
                      <QRColors preset={preset} />
                      <div className="flex flex-1 items-center gap-2">
                        <span className="text-sm font-medium">
                          {preset.name}
                        </span>
                        {isThemeNew(preset) && (
                          <Badge
                            variant="secondary"
                            className="rounded-full text-xs"
                          >
                            New
                          </Badge>
                        )}
                      </div>
                      {preset.id === currentPresetId && (
                        <Check className="h-4 w-4 shrink-0 opacity-70" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {withCycleThemes && (
        <QRPresetCycleControls
          filteredPresets={filteredPresets}
          currentPresetId={currentPresetId}
          className={className}
          disabled={props.disabled}
        />
      )}
    </div>
  );
};

export default QRPresetSelect;
