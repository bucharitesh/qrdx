"use client";

import { Play } from "lucide-react";
import { useState } from "react";

/**
 * Click-to-load video: nothing loads from the video host until the visitor
 * taps play (faster pages, no third-party requests on page view).
 */
export function VideoFacade({
  embedUrl,
  title,
  providerLabel,
  aspect,
  blockId,
}: {
  embedUrl: string;
  title: string;
  providerLabel: string;
  aspect: string;
  blockId: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <iframe
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className={`w-full rounded-(--lp-radius) border-0 bg-black ${aspect}`}
        referrerPolicy="strict-origin-when-cross-origin"
        src={embedUrl}
        title={title || `${providerLabel} video`}
      />
    );
  }

  return (
    <button
      aria-label={`Play video${title ? `: ${title}` : ""}`}
      className={`group relative flex w-full items-center justify-center overflow-hidden rounded-(--lp-radius) bg-neutral-900 text-white ${aspect}`}
      data-lp-block={blockId}
      data-lp-target="play"
      data-qrdx-event="play"
      onClick={() => setPlaying(true)}
      type="button"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-white/15 backdrop-blur transition-transform group-hover:scale-105">
        <Play
          aria-hidden="true"
          className="size-7 translate-x-0.5 fill-current"
        />
      </span>
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pt-8 pb-3 text-left text-sm">
        {title && <span className="block font-medium">{title}</span>}
        <span className="block text-xs opacity-75">
          Plays from {providerLabel}
        </span>
      </span>
    </button>
  );
}
