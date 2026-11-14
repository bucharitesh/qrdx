import type { ThemeProviderProps } from "next-themes";
import type { ComponentProps } from "react";
import { Toaster } from "./components/toaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { ThemeProvider } from "./providers/theme";

type DesignSystemProviderProperties = ThemeProviderProps & {
  /** Props for the app's one toaster (its offsets, for example) */
  toaster?: ComponentProps<typeof Toaster>;
};

export const DesignSystemProvider = ({
  children,
  toaster,
  ...properties
}: DesignSystemProviderProperties) => (
  <ThemeProvider {...properties}>
    <TooltipProvider>{children}</TooltipProvider>
    <Toaster {...toaster} />
  </ThemeProvider>
);

// Export Sonner toast function
export { toast } from "sonner";
export { Toaster } from "./components/toaster";
