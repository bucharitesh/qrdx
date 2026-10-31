"use client";

import { cn } from "@repo/design-system/lib/utils";
import { QRCode } from "qrdx";
import type { BrandKit } from "../_lib/brand-kit";

export function BrandKitPreview({
  kit,
  size = 160,
  className,
}: {
  kit: Pick<BrandKit, "colors" | "style" | "logo">;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center [&_svg]:h-auto [&_svg]:max-w-full",
        className,
      )}
    >
      <QRCode
        bgColor={kit.colors.bgColor ?? "#ffffff"}
        bodyPattern={kit.style.bodyPattern}
        cornerEyeDotPattern={kit.style.cornerEyeDotPattern}
        cornerEyePattern={kit.style.cornerEyePattern}
        dotColor={kit.colors.dotColor}
        eyeColor={kit.colors.eyeColor}
        fgColor={kit.colors.fgColor ?? "#000000"}
        hideLogo={!kit.logo}
        level="Q"
        logo={kit.logo ?? undefined}
        size={size}
        templateId={kit.style.templateId}
        value="https://qrdx.dev"
      />
    </div>
  );
}
