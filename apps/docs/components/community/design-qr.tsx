"use client";

import { cn } from "@repo/design-system/lib/utils";
import { QRCode } from "qrdx";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import type { ThemeStyles } from "@/types/theme";

/** A community design drawn with `value` (in the browser; nothing is sent). */
export function DesignQr({
  style,
  value = "https://qrdx.dev/community",
  className,
}: {
  style: ThemeStyles;
  value?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // The svg fills the box; its viewBox keeps the design's shape centred.
        "flex items-center justify-center [&_svg]:size-full",
        className,
      )}
    >
      <QRCode
        bgColor={style.bgColor}
        bodyPattern={style.bodyPattern}
        cornerEyeDotPattern={style.cornerEyeDotPattern}
        cornerEyePattern={style.cornerEyePattern}
        dotColor={style.dotColor}
        eyeColor={style.eyeColor}
        fgColor={style.fgColor}
        frame={style.frame}
        hideLogo={!style.showLogo}
        level={style.level}
        logo={style.customLogo ?? DEFAULT_QR_LOGO}
        margin={style.margin}
        templateId={style.templateId}
        value={value || " "}
      />
    </div>
  );
}
