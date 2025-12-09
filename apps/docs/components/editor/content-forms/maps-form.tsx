"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { MapsContent } from "@/types/qr-content";
import { encodeMaps } from "@/utils/qr-content-encoder";

export function MapsForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("maps") as MapsContent | undefined;
  const [mapsData, setMapsData] = React.useState<Omit<MapsContent, "type">>({
    location: storedConfig?.location || "",
  });

  React.useEffect(() => {
    const config: MapsContent = { type: "maps", ...mapsData };
    const encoded = encodeMaps(config);
    setValue(encoded);
    setContentConfig("maps", config);
  }, [mapsData, setValue, setContentConfig]);

  return (
    <div className="space-y-2">
      <Label className="text-xs" htmlFor="maps-location">
        Location *
      </Label>
      <Input
        id="maps-location"
        type="text"
        placeholder="Address or coordinates (40.7128, -74.0060)"
        value={mapsData.location}
        onChange={(e) => setMapsData({ location: e.target.value })}
      />
      <p className="text-muted-foreground text-xs">
        Enter an address or coordinates (latitude, longitude). Scanning will
        open Google Maps.
      </p>
    </div>
  );
}
