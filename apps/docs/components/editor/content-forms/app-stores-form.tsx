"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { AppStoresContent } from "@/types/qr-content";
import { encodeAppStores } from "@/utils/qr-content-encoder";

export function AppStoresForm() {
  const { setValue } = useQREditorStore();
  const [appStoreData, setAppStoreData] = React.useState<
    Omit<AppStoresContent, "type">
  >({
    iosUrl: "",
    androidUrl: "",
    fallbackUrl: "",
  });

  React.useEffect(() => {
    const encoded = encodeAppStores({ type: "app-stores", ...appStoreData });
    setValue(encoded);
  }, [appStoreData, setValue]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="app-ios">
          iOS App Store URL
        </Label>
        <Input
          id="app-ios"
          type="url"
          placeholder="https://apps.apple.com/app/..."
          value={appStoreData.iosUrl}
          onChange={(e) =>
            setAppStoreData({ ...appStoreData, iosUrl: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="app-android">
          Google Play Store URL
        </Label>
        <Input
          id="app-android"
          type="url"
          placeholder="https://play.google.com/store/apps/..."
          value={appStoreData.androidUrl}
          onChange={(e) =>
            setAppStoreData({ ...appStoreData, androidUrl: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="app-fallback">
          Fallback URL (Other Devices)
        </Label>
        <Input
          id="app-fallback"
          type="url"
          placeholder="https://yourapp.com"
          value={appStoreData.fallbackUrl}
          onChange={(e) =>
            setAppStoreData({ ...appStoreData, fallbackUrl: e.target.value })
          }
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Provide at least one app store link. For best results, include all three URLs.
      </p>
    </div>
  );
}


