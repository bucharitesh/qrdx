"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { QR_SHAPES, type QRShape } from "qrdx/types";
import ControlSection from "@/components/editor/control-section";
import type { QRStyle } from "@/types/theme";

const SHAPE_NAMES: Record<QRShape, string> = {
  square: "Square",
  circle: "Circle",
};

interface CodeShapeSectionProps {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (shape: QRShape | undefined) => void;
  /** Open it (a link asked for this section) */
  expanded?: boolean;
}

/**
 * The code's outline: square, or a circle that fills a disc around the
 * code with decorative dots. Scanners only read the code in the middle.
 */
export function CodeShapeSection({
  style,
  onChange,
  expanded,
}: CodeShapeSectionProps) {
  const shape = style.shape ?? "square";
  return (
    <ControlSection
      expanded={expanded}
      section="shape"
      summary={SHAPE_NAMES[shape]}
      title="Code shape"
    >
      <fieldset aria-label="Code shape" className="flex flex-wrap gap-1.5">
        {QR_SHAPES.map((id) => (
          <Button
            aria-pressed={shape === id}
            key={id}
            onClick={() => onChange(id === "square" ? undefined : id)}
            size="sm"
            type="button"
            variant={shape === id ? "secondary" : "outline"}
          >
            {SHAPE_NAMES[id]}
          </Button>
        ))}
      </fieldset>
      <p className="text-muted-foreground text-xs text-pretty">
        {shape === "circle"
          ? "The code sits in a circle of decorative dots, with a clear ring around it. Scanners read only the code in the middle, so the circle is a little bigger for the same scan distance."
          : "A circle puts the code in a disc of decorative dots. Scanners read only the code in the middle."}
      </p>
    </ControlSection>
  );
}
