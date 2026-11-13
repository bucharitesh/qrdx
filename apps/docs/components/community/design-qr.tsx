"use client";

import { CANONICAL_ORIGIN } from "@repo/config";
import { cn } from "@repo/design-system/lib/utils";
import { QRCode } from "qrdx";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { useNearViewport } from "@/lib/hooks/use-infinite-scroll";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import type { ThemeStyles } from "@/types/theme";

/** A community design drawn with `value` (in the browser; nothing is sent). */
export function DesignQr({
  style,
  value = `${CANONICAL_ORIGIN}/community`,
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
        {...styleEngineOptions(style)}
      />
    </div>
  );
}

/**
 * DesignQr for cards in long lists: drawn only once the card nears the
 * screen, so the server's HTML carries no SVG for it (a framed design is
 * tens of kilobytes, and a gallery shows dozens). `eager` draws it on the
 * server too, for cards on the first screen.
 */
export function LazyDesignQr({
  eager = false,
  className,
  ...props
}: {
  style: ThemeStyles;
  value?: string;
  className?: string;
  eager?: boolean;
}) {
  const [ref, near] = useNearViewport<HTMLDivElement>({ initial: eager });
  if (near) return <DesignQr className={className} {...props} />;
  return <div aria-hidden className={className} ref={ref} />;
}
