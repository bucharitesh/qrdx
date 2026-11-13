import { FIGURE_VIEW_H, FIGURE_VIEW_W } from "./hairline-figures";

/** A figure's generated markup (./figures/*) as inline SVG. */
export function FigureSvg({ markup }: { markup: string }) {
  return (
    <svg
      // biome-ignore lint/security/noDangerouslySetInnerHtml: generated at build time from our own scenes (apps/docs/scripts/figure-art), never user input
      dangerouslySetInnerHTML={{ __html: markup }}
      focusable="false"
      viewBox={`0 0 ${FIGURE_VIEW_W} ${FIGURE_VIEW_H}`}
      xmlns="http://www.w3.org/2000/svg"
    />
  );
}
