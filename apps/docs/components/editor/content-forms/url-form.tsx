"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import { Global, InfoCircle, Warning2 } from "iconsax-reactjs";
import * as React from "react";
import { UrlLinkSources } from "@/components/connected-accounts/url-link-sources";
import { AccountSourcePicker } from "@/components/data-connections/source-picker";
import {
  checkUrl,
  withScheme,
} from "@/components/editor/content-forms/url-check";
import { DynamicLinkToggle } from "@/components/editor/dynamic-link-toggle";
import { useSmartPaste } from "@/lib/hooks/use-smart-paste";
import { useQREditorStore } from "@/store/editor-store";
import type { UrlContent } from "@/types/qr-content";

export function UrlForm() {
  const storedUrl = useQREditorStore(
    (state) => (state.contentConfigs.url as UrlContent | undefined)?.url ?? "",
  );
  const setValue = useQREditorStore((state) => state.setValue);
  const setContentConfig = useQREditorStore((state) => state.setContentConfig);
  const { handlePaste } = useSmartPaste();
  const helperId = React.useId();

  const [url, setUrl] = React.useState(storedUrl);
  // Errors wait until the field is left once, so typing isn't nagged.
  const [touched, setTouched] = React.useState(storedUrl.trim().length > 0);

  // Sync with store when config changes externally (e.g., smart paste)
  React.useEffect(() => {
    setUrl(storedUrl);
  }, [storedUrl]);

  const check = React.useMemo(() => checkUrl(url), [url]);

  React.useEffect(() => {
    const config: UrlContent = { type: "url", url };
    // Only real web addresses become a QR code; https:// is added when missing.
    const encoded =
      check.status === "ok" || check.status === "warning" ? check.url : "";
    const { value, contentConfigs } = useQREditorStore.getState();
    const currentConfig = contentConfigs.url as UrlContent | undefined;
    if (currentConfig?.url === url && value === encoded) return;
    setValue(encoded);
    setContentConfig("url", config);
  }, [url, check, setValue, setContentConfig]);

  // On blur, show the https:// we add (the field keeps a Unicode domain as
  // typed; the QR payload uses its punycode form).
  const handleBlur = () => {
    setTouched(true);
    const shown =
      check.status === "ok" || check.status === "warning"
        ? withScheme(url)
        : url.trim();
    if (shown !== url) setUrl(shown);
  };

  const showError = check.status === "error" && touched;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="url-input">Website address</Label>
        <Input
          aria-describedby={helperId}
          aria-invalid={showError || undefined}
          autoCapitalize="none"
          autoComplete="url"
          id="url-input"
          inputMode="url"
          onBlur={handleBlur}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleBlur();
          }}
          onPaste={handlePaste}
          placeholder="example.com"
          spellCheck={false}
          type="text"
          value={url}
        />
        <p
          aria-live="polite"
          className={cn(
            "text-muted-foreground flex items-start gap-1.5 text-xs text-pretty",
            showError && "text-destructive",
            check.status === "warning" && "text-amber-700 dark:text-amber-400",
          )}
          id={helperId}
        >
          {showError ? (
            <>
              <InfoCircle className="mt-px size-3.5 shrink-0" />
              {check.message}
            </>
          ) : check.status === "warning" ? (
            <>
              <Warning2 className="mt-px size-3.5 shrink-0" />
              {check.message}
            </>
          ) : check.status === "ok" ? (
            <>
              <Global className="mt-px size-3.5 shrink-0" />
              <span className="min-w-0 truncate">
                Scans open <span className="text-foreground">{check.host}</span>
              </span>
            </>
          ) : (
            "Paste any link. Instagram, YouTube, WhatsApp and other links switch to the matching type."
          )}
        </p>
      </div>
      <UrlLinkSources />
      <AccountSourcePicker
        contentType="url"
        onPick={(item) => setUrl(item.url)}
      />
      <DynamicLinkToggle />
    </div>
  );
}
