"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Switch } from "@repo/design-system/components/ui/switch";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { WifiContent } from "@/types/qr-content";
import { encodeWifi } from "@/utils/qr-content-encoder";

export function WifiForm() {
  const { setValue } = useQREditorStore();
  const [wifiData, setWifiData] = React.useState<Omit<WifiContent, "type">>({
    ssid: "",
    password: "",
    encryption: "WPA",
    hidden: false,
  });

  React.useEffect(() => {
    const encoded = encodeWifi({ type: "wifi", ...wifiData });
    setValue(encoded);
  }, [wifiData, setValue]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="wifi-ssid">
          Network Name (SSID) *
        </Label>
        <Input
          id="wifi-ssid"
          type="text"
          placeholder="My WiFi Network"
          value={wifiData.ssid}
          onChange={(e) => setWifiData({ ...wifiData, ssid: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="wifi-encryption">
          Security Type
        </Label>
        <Select
          value={wifiData.encryption}
          onValueChange={(value: "WPA" | "WEP" | "nopass") =>
            setWifiData({ ...wifiData, encryption: value })
          }
        >
          <SelectTrigger id="wifi-encryption">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WPA">WPA/WPA2</SelectItem>
            <SelectItem value="WEP">WEP</SelectItem>
            <SelectItem value="nopass">No Password</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {wifiData.encryption !== "nopass" && (
        <div className="space-y-2">
          <Label className="text-xs" htmlFor="wifi-password">
            Password *
          </Label>
          <Input
            id="wifi-password"
            type="password"
            placeholder="Network password"
            value={wifiData.password}
            onChange={(e) =>
              setWifiData({ ...wifiData, password: e.target.value })
            }
          />
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50">
        <Label className="cursor-pointer text-xs" htmlFor="wifi-hidden">
          Hidden Network
        </Label>
        <Switch
          id="wifi-hidden"
          checked={wifiData.hidden}
          onCheckedChange={(checked) =>
            setWifiData({ ...wifiData, hidden: checked })
          }
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will automatically connect to this WiFi network
      </p>
    </div>
  );
}


