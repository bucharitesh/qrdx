"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { InfoCircle } from "iconsax-reactjs";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { ContentType, QRContentConfig } from "@/types/qr-content";
import {
  CONTENT_EXAMPLES,
  isContentEmpty,
  isExampleContent,
} from "./content-examples";

interface ExampleFormProps {
  type: ContentType;
  Form: React.ComponentType | undefined;
}

/**
 * Renders a content form with a quiet "Try an example" link that fills it
 * with made-up data. While the example is untouched it is labelled as one.
 */
export function ExampleForm({ type, Form }: ExampleFormProps) {
  const config = useQREditorStore((state) => state.contentConfigs[type]);
  const setContentConfig = useQREditorStore((state) => state.setContentConfig);
  const setValue = useQREditorStore((state) => state.setValue);
  // Forms read the stored config once, so a new key remounts them with it.
  const [revision, setRevision] = React.useState(0);

  const showingExample = isExampleContent(type, config);
  const empty = isContentEmpty(config);

  const fill = (next: QRContentConfig) => {
    setContentConfig(type, next);
    setRevision((current) => current + 1);
  };

  if (!Form) return null;

  return (
    <div className="space-y-3">
      {(empty || showingExample) && (
        <div className="flex min-h-7 items-center justify-between gap-3 text-xs">
          {showingExample ? (
            <>
              <span className="text-muted-foreground inline-flex items-center gap-1.5">
                <InfoCircle className="size-3.5 shrink-0" />
                Example data. Replace it with your own.
              </span>
              <Button
                className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
                onClick={() => {
                  setValue("");
                  fill({ type } as QRContentConfig);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear
              </Button>
            </>
          ) : (
            <Button
              className="ml-auto h-7 px-2 text-xs"
              onClick={() =>
                fill({ type, ...CONTENT_EXAMPLES[type] } as QRContentConfig)
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              Try an example
            </Button>
          )}
        </div>
      )}
      <div className="space-y-4" key={revision}>
        <Form />
      </div>
    </div>
  );
}
