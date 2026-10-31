"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  type ParsedSpotifyLink,
  parseSpotifyUrl,
  SPOTIFY_KIND_LABELS,
  spotifyOEmbedUrl,
} from "@repo/integrations/src/integrations/spotify/parser";
import {
  type ParsedYouTubeLink,
  parseYouTubeUrl,
  YOUTUBE_KIND_LABELS,
  youTubeOEmbedUrl,
  youTubeThumbnailUrl,
} from "@repo/integrations/src/integrations/youtube/parser";
import { fetchOEmbedPreview, type OEmbedPreview } from "@repo/integrations/src/sources/oembed";
import { InfoCircle, MagicStar } from "iconsax-reactjs";
import { useEffect, useMemo, useState } from "react";
import { emitSound } from "@/components/editor/sound";
import { isIntegrationsMock } from "@/lib/data-connections/client";
import { AccountSourcePicker } from "./source-picker";

export type ParsedMediaLink = ParsedYouTubeLink | ParsedSpotifyLink;

/** Where a YouTube link belongs in the YouTube form. */
export function youTubeFields(link: { url: string; field?: string }) {
  return link.field === "channelUrl"
    ? { channelUrl: link.url, videoUrl: "" }
    : { videoUrl: link.url, channelUrl: "" };
}

const MOCK_PREVIEW: OEmbedPreview = {
  title: "How we roast our coffee",
  authorName: "Corner Café",
};

// Public oEmbed reads stay off in development (shared-database rule: no
// third-party calls outside production) unless mock mode supplies a preview.
const previewsAllowed = () => process.env.NODE_ENV === "production";

function usePreview(oembedUrl: string | null) {
  const [preview, setPreview] = useState<OEmbedPreview | null>(null);
  useEffect(() => {
    setPreview(null);
    if (!oembedUrl) return;
    if (isIntegrationsMock()) {
      setPreview(MOCK_PREVIEW);
      return;
    }
    if (!previewsAllowed()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchOEmbedPreview(oembedUrl, { signal: controller.signal })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [oembedUrl]);
  return preview;
}

interface MediaLinkAssistProps {
  kind: "youtube" | "spotify";
  /** What the person typed or pasted */
  value: string;
  /** Use a clean or picked link */
  onApply: (link: { url: string; field?: "videoUrl" | "channelUrl" }) => void;
}

/**
 * Under the YouTube / Spotify inputs: what the link is (video, Short,
 * playlist, channel, song…), its title and thumbnail, a one-click clean link
 * without tracking, and "From your channel / playlists" when configured.
 */
export function MediaLinkAssist({ kind, value, onApply }: MediaLinkAssistProps) {
  const text = value.trim();
  const parsed: ParsedMediaLink | null = useMemo(
    () => (text ? (kind === "youtube" ? parseYouTubeUrl(text) : parseSpotifyUrl(text)) : null),
    [kind, text],
  );
  const oembed = parsed
    ? parsed.provider === "youtube"
      ? youTubeOEmbedUrl(parsed)
      : spotifyOEmbedUrl(parsed)
    : null;
  const preview = usePreview(oembed);
  const thumbnail =
    preview?.thumbnailUrl ??
    (parsed?.provider === "youtube" ? youTubeThumbnailUrl(parsed) : null);
  const kindLabel = parsed
    ? parsed.provider === "youtube"
      ? `${parsed.music ? "YouTube Music " : ""}${YOUTUBE_KIND_LABELS[parsed.kind]}`
      : SPOTIFY_KIND_LABELS[parsed.kind]
    : null;
  const start =
    parsed?.provider === "youtube" && parsed.start
      ? ` · starts at ${Math.floor(parsed.start / 60)}:${String(parsed.start % 60).padStart(2, "0")}`
      : "";
  const isClean = !parsed || parsed.url === text;
  const shortSpotify = kind === "spotify" && /spotify\.link\//i.test(text);

  const picker = (
    <AccountSourcePicker
      contentType={kind}
      onPick={(item) => onApply(kind === "youtube" ? { url: item.url, field: "videoUrl" } : { url: item.url })}
    />
  );

  if (!text) return picker;

  if (!parsed) {
    return (
      <div className="space-y-2">
        <p className="flex items-start gap-1.5 text-muted-foreground text-xs text-pretty">
          <InfoCircle aria-hidden className="mt-px size-3.5 shrink-0" />
          {shortSpotify
            ? "spotify.link short links can't be checked. Open it and copy the full open.spotify.com link instead."
            : kind === "youtube"
              ? "Not a YouTube video, Short, playlist or channel link."
              : "Not a Spotify song, album, artist, playlist or podcast link."}
        </p>
        {picker}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-2.5">
        {thumbnail && (
          <img
            alt=""
            className={
              parsed.provider === "youtube" && parsed.kind !== "short"
                ? "h-12 w-20 shrink-0 rounded-md bg-muted object-cover"
                : "size-12 shrink-0 rounded-md bg-muted object-cover"
            }
            loading="lazy"
            src={thumbnail}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs">
            {kindLabel}
            {start}
            {preview?.authorName ? ` · ${preview.authorName}` : ""}
          </p>
          <p className="truncate text-sm font-medium">
            {preview?.title ?? parsed.url.replace(/^https:\/\//, "")}
          </p>
        </div>
      </div>
      {!isClean && (
        <Button
          className="h-auto max-w-full justify-start whitespace-normal py-1.5 text-left"
          onClick={() => {
            onApply({
              url: parsed.url,
              field: parsed.provider === "youtube" ? parsed.field : undefined,
            });
            emitSound("success");
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <MagicStar aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 break-all">
            Use the clean link{" "}
            <span className="text-muted-foreground">
              {parsed.url.replace(/^https:\/\//, "")}
            </span>
          </span>
        </Button>
      )}
      {picker}
    </div>
  );
}
