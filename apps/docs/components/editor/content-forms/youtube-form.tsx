"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { YouTubeContent } from "@/types/qr-content";
import { encodeYouTube } from "@/utils/qr-content-encoder";

export function YouTubeForm() {
  const { setValue } = useQREditorStore();
  const [youtubeData, setYoutubeData] = React.useState<
    Omit<YouTubeContent, "type">
  >({
    channelUrl: "",
    videoUrl: "",
  });

  React.useEffect(() => {
    const encoded = encodeYouTube({ type: "youtube", ...youtubeData });
    setValue(encoded);
  }, [youtubeData, setValue]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="youtube-video">
          Video URL
        </Label>
        <Input
          id="youtube-video"
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={youtubeData.videoUrl}
          onChange={(e) =>
            setYoutubeData({ ...youtubeData, videoUrl: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="youtube-channel">
          Channel URL
        </Label>
        <Input
          id="youtube-channel"
          type="url"
          placeholder="https://www.youtube.com/@channelname"
          value={youtubeData.channelUrl}
          onChange={(e) =>
            setYoutubeData({ ...youtubeData, channelUrl: e.target.value })
          }
        />
        <p className="text-muted-foreground text-[11px]">
          Enter a video URL or channel URL (video takes priority)
        </p>
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open the YouTube video or channel
      </p>
    </div>
  );
}

