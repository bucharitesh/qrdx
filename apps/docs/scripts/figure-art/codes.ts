// The real QR code in each figure: what it encodes and which showcase style
// (lib/landing/showcase-styles.ts) draws it. Values stay short (version 1–2
// at level L) so the modules still read as a QR code at empty-state size.
// tests/figure-art.test.ts checks that every baked code decodes to `value`.
// AuthorizedApp shows the QRdx mark instead of a code.

import type { HairlineFigureName } from "@/components/mockups/hairline-figures";
import type { ShowcaseStyleName } from "@/lib/landing/showcase-styles";

export interface FigureCode {
  value: string;
  style: ShowcaseStyleName;
}

export const FIGURE_CODES: Partial<Record<HairlineFigureName, FigureCode>> = {
  Chart: { value: "https://qrdx.dev/dashboard", style: "signature" },
  CodeCard: { value: "https://qrdx.dev/dashboard", style: "classy" },
  Domain: { value: "https://qrdx.dev/pricing", style: "signature" },
  Layers: { value: "https://qrdx.dev/playground", style: "fluid" },
  LinkSwap: { value: "https://qrdx.dev/docs", style: "dots" },
  Loupe: { value: "https://qrdx.dev/tools", style: "classic" },
  LostCode: { value: "https://qrdx.dev/docs", style: "facet" },
  Measure: { value: "https://qrdx.dev/qr-codes-on", style: "classic" },
  PageForm: { value: "https://qrdx.dev/templates", style: "classy" },
  Palette: { value: "https://qrdx.dev/community", style: "fluid" },
  Plug: { value: "https://qrdx.dev/integrations", style: "dots" },
  Prompt: { value: "https://qrdx.dev/ai", style: "signature" },
  Question: { value: "mailto:support@qrdx.dev", style: "signature" },
  ScanPhone: { value: "https://qrdx.dev/scan", style: "classic" },
  Stack: { value: "https://qrdx.dev/tools/bulk", style: "classic" },
  Terminal: { value: "https://qrdx.dev/mcp", style: "classic" },
  Webhook: { value: "https://qrdx.dev/docs/webhooks", style: "facet" },
};
