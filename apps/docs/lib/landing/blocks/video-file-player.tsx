"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useEffect, useRef, useState } from "react";
import { UnavailableNotice } from "@/lib/files/block-ui";

const ASPECTS = {
  landscape: "aspect-video",
  portrait: "aspect-[9/16] max-h-[80vh] mx-auto",
  square: "aspect-square",
} as const;

/** Native video player; says "Video unavailable" when the file can't load. */
export function VideoFilePlayer({
  src,
  poster,
  title,
  aspect,
  autoplay,
  blockId,
}: {
  src: string;
  poster: string | null;
  title: string;
  aspect: keyof typeof ASPECTS;
  autoplay: boolean;
  blockId: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  // Errors that fired before hydration aren't seen by onError.
  useEffect(() => {
    const video = ref.current;
    if (
      video?.error ||
      video?.networkState === HTMLMediaElement.NETWORK_NO_SOURCE
    ) {
      setFailed(true);
    }
  }, []);

  if (failed) return <UnavailableNotice label="Video unavailable" />;
  return (
    <video
      aria-label={title}
      autoPlay={autoplay}
      className={cn(
        "block w-full rounded-(--lp-radius) bg-black object-contain",
        ASPECTS[aspect],
      )}
      controls
      data-lp-block={blockId}
      loop={autoplay}
      muted={autoplay}
      onError={() => setFailed(true)}
      playsInline
      poster={poster ?? undefined}
      preload={autoplay ? "auto" : "metadata"}
      ref={ref}
      src={src}
    >
      <a href={src}>Watch {title}</a>
    </video>
  );
}
