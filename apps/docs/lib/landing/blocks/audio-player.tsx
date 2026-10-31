"use client";

import { cn } from "@repo/design-system/lib/utils";
import { Import as Download, Music, Pause, Play } from "iconsax-reactjs";
import { useEffect, useRef, useState } from "react";
import { mutedTextClass, surfaceClass } from "@/components/landing/block-kit";
import { UnavailableNotice } from "@/lib/files/block-ui";

export interface PlaylistTrack {
  id: string;
  src: string;
  downloadSrc: string;
  title: string;
  artist: string;
}

/**
 * Native audio controls (keyboard and screen-reader friendly) with cover art
 * and a playlist: picking a track plays it, the next one follows
 * automatically. Tracks that fail to load say so instead of staying silent.
 */
export function AudioPlaylist({
  tracks,
  cover,
  coverAlt,
  allowDownload,
  blockId,
}: {
  tracks: PlaylistTrack[];
  cover: string | null;
  coverAlt: string;
  allowDownload: boolean;
  blockId: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [index, setIndex] = useState(0);
  // A picked or following track starts on its own (the page already had a tap).
  const [autoPlay, setAutoPlay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [coverFailed, setCoverFailed] = useState(false);
  const current = tracks[Math.min(index, tracks.length - 1)] as PlaylistTrack;

  const markFailed = (id: string) =>
    setFailed((previous) => new Set(previous).add(id));

  // Errors that fired before hydration aren't seen by onError.
  useEffect(() => {
    const audio = audioRef.current;
    if (
      audio?.error ||
      audio?.networkState === HTMLMediaElement.NETWORK_NO_SOURCE
    ) {
      setFailed((previous) => new Set(previous).add(current.id));
    }
  }, [current.id]);

  const play = (next: number) => {
    setAutoPlay(true);
    setIndex(next);
  };

  const select = (next: number) => {
    if (next !== index) return play(next);
    const audio = audioRef.current;
    if (audio?.paused) audio.play().catch(() => {});
    else audio?.pause();
  };

  const unavailable = failed.has(current.id);

  return (
    <div className={cn(surfaceClass, "space-y-3 p-3")}>
      <div className="flex items-center gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-(--lp-radius) bg-(--lp-primary) text-(--lp-primary-fg)">
          {cover && !coverFailed ? (
            <img
              alt={coverAlt}
              className="size-full object-cover"
              decoding="async"
              loading="lazy"
              onError={() => setCoverFailed(true)}
              src={cover}
            />
          ) : (
            <Music aria-hidden="true" className="size-7" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{current.title}</p>
          {current.artist && (
            <p className={cn("truncate text-sm", mutedTextClass)}>
              {current.artist}
            </p>
          )}
        </div>
        {allowDownload && !unavailable && (
          <a
            aria-label={`Download ${current.title}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-(--lp-bg) focus-visible:outline-2 focus-visible:outline-(--lp-primary)"
            data-lp-block={blockId}
            data-lp-target="download"
            href={current.downloadSrc}
            rel="noopener noreferrer"
          >
            <Download aria-hidden="true" className="size-5" />
          </a>
        )}
      </div>

      {unavailable ? (
        <UnavailableNotice
          className="py-3"
          label="This track is unavailable."
        />
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: owners upload music and podcasts; no caption track to offer
        <audio
          className="w-full"
          controls
          key={current.id}
          autoPlay={autoPlay}
          onEnded={() => {
            setPlaying(false);
            if (index < tracks.length - 1) play(index + 1);
          }}
          onError={() => markFailed(current.id)}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          preload="metadata"
          ref={audioRef}
          src={current.src}
        >
          <a href={current.src}>Play {current.title}</a>
        </audio>
      )}

      {tracks.length > 1 && (
        <ol aria-label="Playlist" className="space-y-1">
          {tracks.map((track, i) => {
            const active = i === index;
            return (
              <li key={track.id}>
                <button
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-(--lp-radius) px-2 py-1.5 text-left text-sm hover:bg-(--lp-bg) focus-visible:outline-2 focus-visible:outline-(--lp-primary)",
                    active && "bg-(--lp-bg) font-medium",
                  )}
                  data-lp-block={blockId}
                  data-lp-target={`track-${i + 1}`}
                  onClick={() => select(i)}
                  type="button"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center tabular-nums">
                    {active && playing ? (
                      <Pause aria-hidden="true" className="size-4" />
                    ) : active ? (
                      <Play aria-hidden="true" className="size-4" />
                    ) : (
                      <span className={mutedTextClass}>{i + 1}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{track.title}</span>
                    {track.artist && (
                      <span
                        className={cn("block truncate text-xs", mutedTextClass)}
                      >
                        {track.artist}
                      </span>
                    )}
                  </span>
                  {failed.has(track.id) && (
                    <span className={cn("shrink-0 text-xs", mutedTextClass)}>
                      Unavailable
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
