"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import type { SpotifyFormData } from "@/lib/validations/qr-content";
import { spotifySchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { SpotifyContent } from "@/types/qr-content";
import { encodeSpotify } from "@/utils/qr-content-encoder";

export function SpotifyForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("spotify") as
    | SpotifyContent
    | undefined;
  const [spotifyData, setSpotifyData] = React.useState<SpotifyFormData>({
    uri: storedConfig?.uri || "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Sync with store when config changes (e.g., from smart paste)
  React.useEffect(() => {
    if (storedConfig?.uri && storedConfig.uri !== spotifyData.uri) {
      setSpotifyData({ uri: storedConfig.uri });
    }
  }, [storedConfig]);

  React.useEffect(() => {
    // Validate and encode
    const result = spotifySchema.safeParse(spotifyData);

    if (result.success) {
      const config: SpotifyContent = { type: "spotify", ...result.data };
      const encoded = encodeSpotify(config);
      setValue(encoded);
      setContentConfig("spotify", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [spotifyData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="spotify-uri">
          Spotify URI or URL *
        </Label>
        <Input
          id="spotify-uri"
          type="text"
          placeholder="spotify:track:... or https://open.spotify.com/..."
          value={spotifyData.uri}
          onChange={(e) => setSpotifyData({ uri: e.target.value })}
          className={errors.uri ? "border-destructive" : ""}
        />
        {errors.uri && (
          <p className="text-destructive text-[11px]">{errors.uri}</p>
        )}
        {!errors.uri && (
          <p className="text-muted-foreground text-[11px]">
            Enter a Spotify URI (spotify:track:xxx) or share URL
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open the content in Spotify
      </p>
    </div>
  );
}
