import { cn } from "@repo/design-system/lib/utils";
import Image from "next/image";

// 3D renders with transparent backgrounds (≈512 px), shown small and crisp:
// next/image serves 1x/2x/3x sizes for the exact display width.
const SPRITES = {
  pumpkin: "/images/seasonal/halloween/pumpkin.webp",
  spider: "/images/seasonal/halloween/spider.webp",
  ghost: "/images/seasonal/halloween/ghost.webp",
  cat: "/images/seasonal/halloween/cat.webp",
} as const;

export type SpriteName = keyof typeof SPRITES;

export function Sprite({
  name,
  width,
  height = width,
  className,
}: {
  name: SpriteName;
  width: number;
  height?: number;
  className?: string;
}) {
  return (
    <Image
      src={SPRITES[name]}
      alt=""
      width={width}
      height={height}
      sizes={`${width}px`}
      draggable={false}
      className={cn("pointer-events-none block select-none", className)}
    />
  );
}
