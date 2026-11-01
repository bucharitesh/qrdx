"use client";

import { Play } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import { Pause } from "iconsax-reactjs";
import { useEffect, useRef, useState } from "react";

export interface LoopVideoProps {
  mp4: string;
  webm?: string;
  /** First frame, shown before playback and instead of it with reduced motion. */
  poster: string;
  width: number;
  height: number;
  /** Describes what the clip shows (the video has no audio or captions). */
  label: string;
  className?: string;
  /** Classes for the <video> element (e.g. object-cover sizing). */
  videoClassName?: string;
  /** Classes for the pause/play button. */
  buttonClassName?: string;
}

/**
 * Short muted screen recording that loops while on screen. It never
 * autoplays with prefers-reduced-motion (the poster stays), pauses when
 * scrolled away, and has a visible pause/play button.
 */
export function LoopVideo({
  mp4,
  webm,
  poster,
  width,
  height,
  label,
  className,
  videoClassName,
  buttonClassName,
}: LoopVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  // null until the user presses the button; then their choice wins.
  const [userPaused, setUserPaused] = useState<boolean | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const wantsPlay = userPaused === null ? !reduced : !userPaused;
    if (!wantsPlay) {
      video.pause();
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      video.play().catch(() => undefined);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [userPaused]);

  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      <video
        ref={ref}
        aria-label={label}
        className={cn("block h-auto w-full", videoClassName)}
        height={height}
        loop
        muted
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        playsInline
        poster={poster}
        preload="metadata"
        width={width}
      >
        {webm && <source src={webm} type="video/webm" />}
        <source src={mp4} type="video/mp4" />
      </video>
      <button
        type="button"
        onClick={() => setUserPaused(playing)}
        aria-label={playing ? "Pause video" : "Play video"}
        className={cn(
          "absolute right-3 bottom-3 flex size-8 items-center justify-center rounded-full border border-border bg-background/85 text-foreground shadow-sm backdrop-blur transition-[background-color,transform] duration-150 hover:bg-muted active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          buttonClassName,
        )}
      >
        {playing ? (
          <Pause variant="Bold" className="size-3.5" />
        ) : (
          <Play variant="Bold" className="size-3.5" />
        )}
      </button>
    </div>
  );
}
