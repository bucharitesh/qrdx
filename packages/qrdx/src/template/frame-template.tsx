/** @jsxImportSource ../jsx */
// Built-in templates drawn from frame specs: each template's artwork is a
// frame spec (./specs), compiled by src/frame-spec.ts and drawn with the
// frame renderer, then placed where the template always drew it in its
// 300 × 300 box. A template keeps its own sizing (the whole artwork is the
// requested size, the code inside it smaller) and takes the code's dark
// color as its frame color, as the hand-written templates did up to qrdx
// 0.0.51; tests/template-spec-parity.test.ts proves they draw the same.
import type { TemplateDefinition } from "../../types";
import type { FrameSpec } from "../../types/frame-spec";
import { frameShapeElements } from "../frame";
import { frameSpecLayout, resolveFrameSpec } from "../frame-spec";
import { getSolidColor } from "../utils/color";
import { fmt } from "../utils/fmt";

/** The template box every template draws in (utils.tsx scales it to size). */
const TEMPLATE_BOX = 300;

export interface TemplateFrame {
  id: string;
  name: string;
  description: string;
  /** The template's artwork as a frame spec (cropped to the artwork) */
  spec: FrameSpec;
  /** Where the spec's artboard sits in the 300 × 300 template box */
  at: { x: number; y: number; scale: number };
}

/** A built-in template that draws `frame.spec` around the code. */
export function frameTemplate(frame: TemplateFrame): TemplateDefinition {
  return {
    id: frame.id,
    name: frame.name,
    description: frame.description,
    spec: frame.spec,
    wrapper: (children, props) => {
      const spec = resolveFrameSpec(frame.spec);
      // The artwork takes the code's dark color, as templates always have
      const fg = props?.fgColor;
      const color =
        (typeof fg === "string" ? fg : getSolidColor(fg, "")) || "black";
      const layout = frameSpecLayout(spec.qr.size, spec, { color });
      const { x, y, scale } = frame.at;
      return (
        <svg
          height={TEMPLATE_BOX}
          id="svgQrWrapper"
          style={{ width: "100%", height: "100%" }}
          viewBox={`0 0 ${TEMPLATE_BOX} ${TEMPLATE_BOX}`}
          width={TEMPLATE_BOX}
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
        >
          <g
            data-qrdx-template={frame.id}
            transform={`translate(${fmt(x)} ${fmt(y)})${scale === 1 ? "" : ` scale(${scale})`}`}
          >
            {frameShapeElements(layout)}
            <g
              fill="none"
              transform={`translate(${fmt(layout.qrX)} ${fmt(layout.qrY)}) scale(${layout.qrSize / TEMPLATE_BOX})`}
            >
              {children}
            </g>
          </g>
        </svg>
      );
    },
  };
}
