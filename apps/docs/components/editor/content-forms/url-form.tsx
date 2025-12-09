"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";

export function UrlForm() {
  const { value, setValue } = useQREditorStore();

  return (
    <div className="space-y-2">
      <Label className="text-xs" htmlFor="url-input">
        URL or Text
      </Label>
      <Input
        id="url-input"
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://example.com or any text"
        type="text"
        value={value}
      />
      <p className="text-muted-foreground text-xs">
        Enter a website URL or any plain text content
      </p>
    </div>
  );
}


