import { Button } from "@repo/design-system/components/ui/button";
import { SquarePen } from "lucide-react";
import { getNormalizedColor } from "qrdx";
import { CopyButton } from "@/components/copy-button";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import {
  type FocusColorId,
  useColorControlFocus,
} from "@/store/color-control-focus-store";
import type { ThemeEditorPreviewProps } from "@/types/theme";

interface ColorPreviewProps {
  styles: ThemeEditorPreviewProps["styles"];
}

function ColorPreviewItem({
  label,
  color,
  colorConfig,
  name,
}: {
  label: string;
  color: string;
  colorConfig: import("qrdx/types").ColorConfig | undefined;
  name: string;
}) {
  const { focusColor } = useColorControlFocus();
  const swatchStyle =
    colorConfig !== undefined && colorConfig !== null
      ? { backgroundColor: getNormalizedColor(colorConfig) }
      : { backgroundColor: color };

  return (
    <div className="group/color-preview hover:bg-muted/60 relative flex items-center gap-2 rounded-md p-1 transition-colors">
      <div
        className="size-14 shrink-0 rounded-md border @max-3xl:size-12"
        style={swatchStyle}
      />
      <div className="flex-1 space-y-1 overflow-hidden">
        <p className="line-clamp-2 text-sm leading-tight font-medium @max-3xl:text-xs">
          {label}
        </p>
        <p className="text-muted-foreground truncate font-mono text-xs">
          {color}
        </p>
      </div>

      <div className="hidden flex-col opacity-0 transition-opacity group-hover/color-preview:opacity-100 md:flex">
        <TooltipWrapper label="Edit color" asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => focusColor(name as FocusColorId)}
            className="size-7 @max-3xl:size-6 [&>svg]:size-3.5"
          >
            <SquarePen />
          </Button>
        </TooltipWrapper>
        <CopyButton textToCopy={color} className="size-7 @max-3xl:size-6" />
      </div>
    </div>
  );
}

const ColorPreview = ({ styles }: ColorPreviewProps) => {
  if (!styles) {
    return null;
  }

  return (
    <div className="@container grid grid-cols-1 gap-4 md:gap-8">
      {/* Primary Colors */}
      <div className="space-y-4 @max-3xl:space-y-2">
        <h3 className="text-muted-foreground text-sm font-semibold">
          Primary Theme Colors
        </h3>
        <div className="@6xl grid grid-cols-1 gap-2 @sm:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4">
          <ColorPreviewItem
            label="Background"
            color={getNormalizedColor(styles.bgColor)}
            colorConfig={styles.bgColor}
            name="background"
          />
          <ColorPreviewItem
            label="Foreground"
            color={getNormalizedColor(styles.fgColor)}
            colorConfig={styles.fgColor}
            name="foreground"
          />
          <ColorPreviewItem
            label="Dot Color"
            color={getNormalizedColor(styles.dotColor)}
            colorConfig={styles.dotColor}
            name="primary"
          />
          <ColorPreviewItem
            label="Eye Color"
            color={getNormalizedColor(styles.eyeColor)}
            colorConfig={styles.eyeColor}
            name="primary-foreground"
          />
        </div>
      </div>
    </div>
  );
};

export default ColorPreview;
