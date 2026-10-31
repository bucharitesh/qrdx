import { cn } from "@repo/design-system/lib/utils";
import type { CSSProperties, ReactNode } from "react";
import { type BlockRenderContext, getBlock } from "@/lib/landing/blocks";
import type { LandingPageContent } from "@/types/landing";
import { PAGE_SETTINGS_TYPE } from "./page-settings-block";
import { backgroundStyle, luminance, themeVariables } from "./theme";

/**
 * Renders hosted page content: theme, blocks and an optional footer.
 * Server-renderable (no hooks): used by /p/<slug> and the editor preview.
 * Owner CSS must already be validated + scoped (components/landing/custom-css).
 */
export function LandingRender({
  content,
  context,
  customCss,
  footer,
  fill = "screen",
  className,
}: {
  content: LandingPageContent;
  context: BlockRenderContext;
  /** Scoped CSS from scopeCustomCss(), or null */
  customCss?: string | null;
  footer?: ReactNode;
  /** "screen" for the live page, "container" inside the editor preview */
  fill?: "screen" | "container";
  className?: string;
}) {
  const { theme, blocks } = content;
  const dark = luminance(theme.colors.background) < 0.35;

  return (
    <div
      className={cn(
        "lp-root flex w-full flex-col antialiased",
        fill === "screen" ? "min-h-svh" : "min-h-full",
        className,
      )}
      data-mode={context.mode}
      style={
        {
          ...themeVariables(theme),
          ...backgroundStyle(theme),
          colorScheme: dark ? "dark" : "light",
        } as CSSProperties
      }
    >
      {customCss && (
        // Safe: scopeCustomCss() rejects "<" and backslash escapes.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: validated, scoped owner CSS
        <style dangerouslySetInnerHTML={{ __html: customCss }} />
      )}
      <main
        className="lp-page relative mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pt-10 pb-8"
        data-qrdx-page=""
        // Paint containment keeps owner CSS (fixed/absolute content) inside the page.
        style={
          customCss ? { contain: "paint", isolation: "isolate" } : undefined
        }
      >
        {theme.logo && (
          <img
            alt={theme.logo.alt ?? ""}
            className="lp-logo mx-auto h-10 w-auto max-w-[60%] object-contain"
            decoding="async"
            src={theme.logo.url}
          />
        )}
        {blocks.map((block) => {
          if (block.hidden || block.type === PAGE_SETTINGS_TYPE) return null;
          const definition = getBlock(block.type);
          if (!definition) return null;
          const { Render } = definition;
          return (
            <div
              className={`lp-block lp-block-${block.type} empty:hidden`}
              data-block-id={block.id}
              key={block.id}
            >
              <Render context={context} id={block.id} props={block.props} />
            </div>
          );
        })}
      </main>
      {footer}
    </div>
  );
}
