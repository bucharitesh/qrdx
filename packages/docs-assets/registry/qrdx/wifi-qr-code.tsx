"use client";

import { Wifi } from "lucide-react";
import { QRCode } from "qrdx";
import type { ComponentProps } from "react";
import { cn } from "@/registry/lib/utils";

/** qrdx style options: colors, gradients, patterns, logo, template. */
export type QrCodeStyle = Omit<ComponentProps<typeof QRCode>, "value" | "size">;

export type WifiEncryption = "WPA" | "WEP" | "nopass";

export interface WifiNetwork {
  /** Network name (SSID). */
  ssid: string;
  /** Network password. Ignored when `encryption` is "nopass". */
  password?: string;
  /**
   * "WPA" covers WPA, WPA2 and WPA3. Use "nopass" for open networks.
   * @default "WPA"
   */
  encryption?: WifiEncryption;
  /**
   * Set when the network does not broadcast its name.
   * @default false
   */
  hidden?: boolean;
}

/** Escapes the characters the Wi-Fi QR format reserves. */
function escapeWifi(value: string) {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

/**
 * Builds the `WIFI:` payload that iOS and Android cameras read to join a
 * network, e.g. `WIFI:T:WPA;S:Cafe;P:secret;;`.
 */
export function buildWifiPayload({
  ssid,
  password = "",
  encryption = "WPA",
  hidden = false,
}: WifiNetwork): string {
  const fields = [`T:${encryption}`, `S:${escapeWifi(ssid)}`];
  if (encryption !== "nopass") fields.push(`P:${escapeWifi(password)}`);
  if (hidden) fields.push("H:true");
  return `WIFI:${fields.join(";")};;`;
}

export type WifiQrCodeProps = WifiNetwork &
  Omit<ComponentProps<"figure">, "children" | "hidden"> & {
    /**
     * Width and height of the code in pixels.
     * @default 180
     */
    size?: number;
    /** qrdx style options for the code. */
    qr?: QrCodeStyle;
    /**
     * Show the network name under the code.
     * @default true
     */
    showDetails?: boolean;
    /**
     * Also print the password, for guests who type it in.
     * @default false
     */
    showPassword?: boolean;
  };

export function WifiQrCode({
  ssid,
  password,
  encryption = "WPA",
  hidden,
  size = 180,
  qr,
  showDetails = true,
  showPassword = false,
  className,
  ...props
}: WifiQrCodeProps) {
  const payload = buildWifiPayload({ ssid, password, encryption, hidden });

  return (
    <figure
      className={cn("inline-flex flex-col items-center gap-3", className)}
      data-slot="wifi-qr-code"
      {...props}
    >
      <div
        aria-label={`QR code to join the Wi-Fi network ${ssid}`}
        className="overflow-hidden rounded-[10px] border"
        role="img"
        style={{ width: size, height: size }}
      >
        <QRCode margin={2} {...qr} size={size} value={payload} />
      </div>
      {showDetails ? (
        <figcaption className="flex flex-col items-center gap-0.5 text-center text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Wifi aria-hidden="true" className="size-4 text-muted-foreground" />
            {ssid}
          </span>
          {showPassword && encryption !== "nopass" && password ? (
            <span className="text-muted-foreground">
              Password: <span className="font-mono">{password}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              Scan with your camera to join
            </span>
          )}
        </figcaption>
      ) : null}
    </figure>
  );
}
