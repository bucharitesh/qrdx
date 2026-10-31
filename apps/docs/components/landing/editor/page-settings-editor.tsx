"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { Diamonds as Gem, Lock } from "iconsax-reactjs";
import { useId } from "react";
import type { BlockEditorProps } from "@/lib/landing/registry";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { MAX_CUSTOM_CSS_LENGTH } from "../custom-css";
import type { PageSettings } from "../page-settings-block";
import { ImageField, SwitchField, TextField } from "./fields";

export function PageSettingsEditor({
  value,
  onChange,
  customCssAllowed = false,
}: BlockEditorProps<PageSettings> & { customCssAllowed?: boolean }) {
  const set = (patch: Partial<PageSettings>) =>
    onChange({ ...value, ...patch });
  const cssId = useId();
  const openUpgradeDialog = useGetProDialogStore(
    (state) => state.openUpgradeDialog,
  );

  return (
    <div className="space-y-5">
      <TextField
        hint="Shown when the link is shared in chats and social apps."
        label="Description"
        maxLength={300}
        multiline
        onChange={(description) => set({ description })}
        value={value.description}
      />
      <ImageField
        hint="1200×630 works best. Defaults to the header photo."
        label="Share image"
        onChange={(shareImage) => set({ shareImage })}
        value={value.shareImage}
      />
      <SwitchField
        checked={value.indexable}
        hint="Off by default: hosted pages are hidden from Google and other search engines."
        label="Show in search engines"
        onChange={(indexable) => set({ indexable })}
      />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-medium" htmlFor={cssId}>
            Custom CSS
          </Label>
          {!customCssAllowed && (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <Lock className="size-3" />
              Business
            </span>
          )}
        </div>
        <Textarea
          className="min-h-32 font-mono text-xs"
          disabled={!customCssAllowed}
          id={cssId}
          maxLength={MAX_CUSTOM_CSS_LENGTH}
          onChange={(event) => set({ customCss: event.target.value })}
          placeholder={".lp-block-links a {\n  letter-spacing: 0.02em;\n}"}
          spellCheck={false}
          value={value.customCss}
        />
        <p className="text-muted-foreground text-xs">
          Styles apply only inside your page. Target blocks with{" "}
          <code>.lp-block-&lt;type&gt;</code> (e.g. <code>.lp-block-links</code>
          ). Images, fonts and other files can't be loaded from CSS.
        </p>
        {!customCssAllowed && (
          <Button
            onClick={() => openUpgradeDialog("business")}
            size="sm"
            type="button"
            variant="outline"
          >
            <Gem />
            Upgrade to Business for custom CSS
          </Button>
        )}
      </div>
    </div>
  );
}
