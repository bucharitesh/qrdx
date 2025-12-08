import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Card, CardContent } from "@repo/design-system/components/ui/card";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@repo/design-system/components/ui/revola";
import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import { Separator } from "@repo/design-system/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { cn } from "@repo/design-system/lib/utils";
import { AlertTriangle, Check, Contrast, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { useContrastChecker } from "@/lib/hooks/use-contrast-checker";
import type { ThemeStyles } from "@/types/theme";
import { TooltipWrapper } from "../tooltip-wrapper";

type ContrastCheckerProps = {
  currentStyles: ThemeStyles;
  disabled?: boolean;
};

const MIN_CONTRAST_RATIO = 4.5;

type ColorCategory = "content" | "interactive" | "functional";

type ColorPair = {
  id: string;
  foregroundId: keyof ThemeStyles;
  backgroundId: keyof ThemeStyles;
  foreground: string | undefined;
  background: string | undefined;
  label: string;
  category: ColorCategory;
};

const ContrastChecker = ({ currentStyles, disabled }: ContrastCheckerProps) => {
  const [filter, setFilter] = useState<"all" | "issues">("all");
  const { theme, setTheme } = useTheme();

  const colorPairsToCheck: ColorPair[] = [
    // QR Code Base Colors
    {
      id: "base",
      foregroundId: "fgColor",
      backgroundId: "bgColor",
      foreground: currentStyles?.fgColor,
      background: currentStyles?.bgColor,
      label: "QR Code Base",
      category: "content",
    },
    {
      id: "eye",
      foregroundId: "eyeColor",
      backgroundId: "bgColor",
      foreground: currentStyles?.eyeColor || currentStyles?.fgColor,
      background: currentStyles?.bgColor,
      label: "Corner Eyes",
      category: "interactive",
    },
    {
      id: "dot",
      foregroundId: "dotColor",
      backgroundId: "bgColor",
      foreground:
        currentStyles?.dotColor ||
        currentStyles?.eyeColor ||
        currentStyles?.fgColor,
      background: currentStyles?.bgColor,
      label: "Eye Dots",
      category: "functional",
    },
  ];

  const validColorPairsToCheck = colorPairsToCheck.filter(
    (pair): pair is ColorPair & { foreground: string; background: string } =>
      !!pair.foreground && !!pair.background,
  );
  const contrastResults = useContrastChecker(validColorPairsToCheck);

  const getContrastResult = (pairId: string) => {
    return contrastResults?.find((res) => res.id === pairId);
  };

  const totalIssues = contrastResults?.filter(
    (result) => result.contrastRatio < MIN_CONTRAST_RATIO,
  ).length;

  const filteredPairs =
    filter === "all"
      ? colorPairsToCheck
      : colorPairsToCheck.filter((pair) => {
          const result = getContrastResult(pair.id);
          return result && result.contrastRatio < MIN_CONTRAST_RATIO;
        });

  // Group color pairs by category
  const categoryLabels: Record<ColorCategory, string> = {
    content: "QR Code Base",
    interactive: "Corner Elements",
    functional: "Eye Details",
  };

  const categories: ColorCategory[] = ["content", "interactive", "functional"];
  const groupedPairs = categories
    .map((category) => ({
      category,
      label: categoryLabels[category],
      pairs: filteredPairs.filter((pair) => pair.category === category),
    }))
    .filter((group) => group.pairs.length > 0);

  return (
    <ResponsiveDialog>
      <TooltipWrapper label="Contrast Checker" asChild>
        <ResponsiveDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="justify-start px-2"
            disabled={disabled}
          >
            <Contrast className="h-4 w-4" />
          </Button>
        </ResponsiveDialogTrigger>
      </TooltipWrapper>

      <ResponsiveDialogContent className="flex max-h-[95dvh] flex-col gap-0 space-y-6 overflow-hidden shadow-lg sm:max-h-[min(700px,85dvh)] sm:w-[calc(100%-2rem)] sm:max-w-4xl sm:pt-6">
        <div className="flex flex-col items-end justify-between gap-4 px-6 sm:flex-row">
          <ResponsiveDialogHeader className="text-left">
            <ResponsiveDialogTitle>Contrast Checker</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              WCAG 2.0 AA requires a contrast ratio of at least{" "}
              {MIN_CONTRAST_RATIO}:1{" • "}
              <a
                href="https://www.w3.org/TR/WCAG21/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 underline transition-colors"
              >
                Learn more
              </a>
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="hidden items-center gap-2 md:flex">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                >
                  {theme === "light" ? (
                    <Sun className="h-3.5 w-3.5" />
                  ) : (
                    <Moon className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">Toggle theme</p>
              </TooltipContent>
            </Tooltip>
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              All
            </Button>
            <Button
              size="sm"
              disabled={totalIssues === 0}
              variant={filter === "issues" ? "default" : "outline"}
              onClick={() => setFilter("issues")}
            >
              <AlertTriangle className={cn("mr-1 h-3 w-3")} />
              Issues ({totalIssues})
            </Button>
          </div>
        </div>

        <ScrollArea className="relative flex flex-1 flex-col">
          <div className="space-y-6 px-6 pb-6">
            {groupedPairs.map((group) => (
              <div key={group.category} className="">
                <div className="bg-background sticky -top-px z-10 flex items-center gap-2 pb-4 sm:rounded-b-xl">
                  <h2 className="text-md font-semibold">{group.label}</h2>
                  <Separator className="flex-1" />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {group.pairs.map((pair) => {
                    const result = getContrastResult(pair.id);
                    const isValid =
                      result?.contrastRatio !== undefined &&
                      result?.contrastRatio >= MIN_CONTRAST_RATIO;
                    const contrastRatio =
                      result?.contrastRatio?.toFixed(2) ?? "N/A";
                    return (
                      <Card
                        key={pair.id}
                        className={cn(
                          "transition-all duration-200",
                          !isValid && "border-dashed",
                        )}
                      >
                        <CardContent className="p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <h3
                              className={cn(
                                "flex items-center font-medium",
                                !isValid && "text-destructive",
                              )}
                            >
                              {pair.label}
                              {!isValid && (
                                <AlertTriangle className="ml-1 size-3.5" />
                              )}
                            </h3>
                            <Badge
                              variant={isValid ? "default" : "destructive"}
                              className={cn(
                                "flex items-center gap-1 text-xs",
                                isValid
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-destructive text-destructive-foreground",
                              )}
                            >
                              {isValid ? (
                                <>
                                  <Check className="h-3 w-3" />
                                  {contrastRatio}
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="h-3 w-3" />
                                  {contrastRatio}
                                </>
                              )}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex flex-1 flex-col items-center gap-3">
                              <div className="flex w-full items-center gap-3">
                                <div
                                  style={{
                                    backgroundColor:
                                      pair.background ?? "#000000",
                                  }}
                                  className="h-12 w-12 shrink-0 rounded-md border shadow-sm"
                                ></div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-medium">
                                    Background
                                  </span>
                                  <span className="text-muted-foreground font-mono text-xs">
                                    {pair.background}
                                  </span>
                                </div>
                              </div>
                              <div className="flex w-full items-center gap-3">
                                <div
                                  style={{
                                    backgroundColor:
                                      pair.foreground ?? "#ffffff",
                                  }}
                                  className="h-12 w-12 shrink-0 rounded-md border shadow-sm"
                                ></div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-medium">
                                    Foreground
                                  </span>
                                  <span className="text-muted-foreground font-mono text-xs">
                                    {pair.foreground}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div
                              style={{
                                backgroundColor:
                                  pair.background ?? "transparent",
                              }}
                              className="flex h-full min-h-[120px] flex-1 items-center justify-center overflow-hidden rounded-lg border shadow-sm"
                            >
                              {pair.foreground && pair.background ? (
                                <div className="p-4 text-center">
                                  <p
                                    style={{ color: pair.foreground }}
                                    className="mb-2 text-4xl font-bold tracking-wider"
                                  >
                                    Aa
                                  </p>
                                  <p
                                    style={{ color: pair.foreground }}
                                    className="text-sm font-medium"
                                  >
                                    Sample Text
                                  </p>
                                </div>
                              ) : (
                                <p className="text-muted-foreground text-xs">
                                  Preview
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
};

export default ContrastChecker;
