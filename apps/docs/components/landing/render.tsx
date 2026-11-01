import { cn } from "@repo/design-system/lib/utils";
import type { CSSProperties, ReactNode } from "react";
import { type BlockRenderContext, getBlock } from "@/lib/landing/blocks";
import type { LandingPageContent } from "@/types/landing";
import { landingFontClass } from "./fonts";
import { PAGE_SETTINGS_TYPE } from "./page-settings-block";
import { backgroundStyle, luminance, themeVariables } from "./theme";

const PAGE_CLASS =
  "lp-page relative mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pt-10 pb-8";

/** Space between blocks for `theme.spacing` (unset keeps gap-5). */
const SPACING = { compact: "gap-3.5", relaxed: "gap-7" } as const;

/**
 * `theme.headingFont`: h1–h3 take the heading face, weight and tracking (and
 * the divs that stand in for them in thumbnails, components/landing/heading).
 */
const HEADING_FONT_CLASS =
  "[&_:is(h1,h2,h3,[data-lp-heading])]:font-(family-name:--lp-heading-font) [&_:is(h1,h2,h3,[data-lp-heading])]:font-(--lp-heading-weight) [&_:is(h1,h2,h3,[data-lp-heading])]:tracking-(--lp-heading-tracking)";

/** Blocks that fit on a phone's first screen, give or take. */
const FIRST_SCREEN_BLOCKS = 3;

/**
 * The block whose large photo is the likely LCP: the first block of the
 * first screen with a `leadImage` (none in thumbnails, which load lazily).
 */
function leadImageBlockId(
  blocks: LandingPageContent["blocks"],
  context: BlockRenderContext,
): string | undefined {
  if (context.thumbnail) return undefined;
  return blocks
    .filter((block) => !block.hidden && block.type !== PAGE_SETTINGS_TYPE)
    .slice(0, FIRST_SCREEN_BLOCKS)
    .find((block) => getBlock(block.type)?.leadImage?.(block.props))?.id;
}

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
  const leadId = leadImageBlockId(blocks, context);
  const leadContext = { ...context, leadImage: true };

  return (
    <div
      className={cn(
        "lp-root flex w-full flex-col antialiased",
        fill === "screen" ? "min-h-svh" : "min-h-full",
        // Opt-in theme options: unset, the markup is unchanged.
        landingFontClass(theme),
        theme.headingFont && HEADING_FONT_CLASS,
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
        className={
          theme.spacing ? cn(PAGE_CLASS, SPACING[theme.spacing]) : PAGE_CLASS
        }
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
              <Render
                context={block.id === leadId ? leadContext : context}
                id={block.id}
                props={block.props}
              />
            </div>
          );
        })}
      </main>
      {footer}
    </div>
  );
}
