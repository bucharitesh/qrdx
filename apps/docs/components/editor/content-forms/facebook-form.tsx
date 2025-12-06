"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { FacebookContent } from "@/types/qr-content";
import { encodeFacebook } from "@/utils/qr-content-encoder";

export function FacebookForm() {
  const { setValue } = useQREditorStore();
  const [facebookData, setFacebookData] = React.useState<
    Omit<FacebookContent, "type">
  >({
    profileUrl: "",
  });

  React.useEffect(() => {
    const encoded = encodeFacebook({ type: "facebook", ...facebookData });
    setValue(encoded);
  }, [facebookData, setValue]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="facebook-url">
          Facebook Profile URL *
        </Label>
        <Input
          id="facebook-url"
          type="url"
          placeholder="https://www.facebook.com/username"
          value={facebookData.profileUrl}
          onChange={(e) =>
            setFacebookData({ ...facebookData, profileUrl: e.target.value })
          }
        />
        <p className="text-muted-foreground text-[11px]">
          Enter your full Facebook profile or page URL
        </p>
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open your Facebook profile or page
      </p>
    </div>
  );
}
