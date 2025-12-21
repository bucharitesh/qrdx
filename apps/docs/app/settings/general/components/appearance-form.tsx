"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import { Check } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { DarkTheme } from "./dark-theme";
import { LightTheme } from "./light-theme";
import { SystemTheme } from "./system-theme";

const themes = [
  {
    id: "light",
    name: "Light",
    description: "Light theme for daytime use",
    icon: LightTheme,
  },
  {
    id: "dark",
    name: "Dark",
    description: "Dark theme for nighttime use",
    icon: DarkTheme,
  },
  {
    id: "system",
    name: "System",
    description: "Sync with your system settings",
    icon: SystemTheme,
  },
] as const;

export function AppearanceForm() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Avoid hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize how the interface looks and feels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {themes.map((themeOption) => (
              <div
                key={themeOption.id}
                className="relative flex flex-col gap-3 rounded-lg border border-border p-4 bg-card"
              >
                <div className="aspect-video overflow-hidden rounded-md border border-border bg-muted">
                  <div className="h-full w-full animate-pulse bg-muted" />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="font-medium">{themeOption.name}</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {themeOption.description}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Customize how the interface looks and feels
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {themes.map((themeOption) => {
              const Icon = themeOption.icon;
              const isSelected = theme === themeOption.id;

              return (
                <button
                  type="button"
                  key={themeOption.id}
                  onClick={() => setTheme(themeOption.id)}
                  className={cn(
                    "relative flex flex-col gap-3 rounded-lg border p-4 transition-all hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isSelected
                      ? "border-primary bg-accent shadow-sm"
                      : "border-border bg-card",
                  )}
                >
                  {/* Selected indicator */}
                  {isSelected && (
                    <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}

                  {/* Theme preview */}
                  <div className="aspect-video border border-border bg-muted">
                    <Icon />
                  </div>

                  {/* Theme info */}
                  <div className="flex flex-col items-start gap-1 text-left">
                    <Label
                      className={cn(
                        "cursor-pointer font-medium",
                        isSelected && "text-primary",
                      )}
                    >
                      {themeOption.name}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {themeOption.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

