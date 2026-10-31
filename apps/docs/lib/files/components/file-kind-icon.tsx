import { FileText, ImageIcon, Music, Video } from "lucide-react";
import type { FileKind } from "../types";

const ICONS = {
  pdf: FileText,
  image: ImageIcon,
  audio: Music,
  video: Video,
} as const;

export function FileKindIcon({
  kind,
  className,
}: {
  kind: FileKind;
  className?: string;
}) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden="true" className={className} />;
}
