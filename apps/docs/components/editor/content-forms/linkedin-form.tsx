"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { LinkedInContent } from "@/types/qr-content";
import { encodeLinkedIn } from "@/utils/qr-content-encoder";

export function LinkedInForm() {
  const { setValue } = useQREditorStore();
  const [linkedinData, setLinkedinData] = React.useState<
    Omit<LinkedInContent, "type">
  >({
    profileUrl: "",
  });

  React.useEffect(() => {
    const encoded = encodeLinkedIn({ type: "linkedin", ...linkedinData });
    setValue(encoded);
  }, [linkedinData, setValue]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="linkedin-url">
          LinkedIn Profile URL *
        </Label>
        <Input
          id="linkedin-url"
          type="url"
          placeholder="https://www.linkedin.com/in/username"
          value={linkedinData.profileUrl}
          onChange={(e) =>
            setLinkedinData({ ...linkedinData, profileUrl: e.target.value })
          }
        />
        <p className="text-muted-foreground text-[11px]">
          Enter your full LinkedIn profile or company page URL
        </p>
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open your LinkedIn profile
      </p>
    </div>
  );
}


