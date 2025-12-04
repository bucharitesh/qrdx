"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { TooltipWrapper } from "./tooltip-wrapper";

interface ThemeToggleProps extends React.ComponentProps<typeof Button> {}

export function ThemeToggle({ className, ...props }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  const handleThemeToggle = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <TooltipWrapper label="Toggle theme" asChild>
      <Button
        variant="ghost"
        size="icon"
        className={cn("cursor-pointer", className)}
        {...props}
        onClick={handleThemeToggle}
      >
        {theme === "light" ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
      </Button>
    </TooltipWrapper>
  );
}

