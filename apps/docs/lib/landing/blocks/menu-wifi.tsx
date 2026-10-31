import { cn } from "@repo/design-system/lib/utils";
import { Wifi } from "iconsax-reactjs";
import { z } from "zod";
import {
  lineText,
  mutedTextClass,
  surfaceClass,
} from "@/components/landing/block-kit";
import { type BlockRenderProps, registerBlock } from "../registry";
import { CopyButton } from "./coupon-copy";
import { WifiEditor } from "./menu-wifi-editor";

export const wifiSchema = z
  .object({
    title: lineText(60).default("Wi-Fi"),
    ssid: lineText(32).min(1, "Enter the network name"),
    // Not trimmed: spaces can be part of a password.
    password: z.string().max(63).default(""),
    security: z.enum(["WPA", "WEP", "nopass"]).default("WPA"),
    hidden: z.boolean().default(false),
    note: lineText(160).default(""),
  })
  .refine((wifi) => wifi.security === "nopass" || wifi.password.length > 0, {
    message: "Enter the Wi-Fi password",
    path: ["password"],
  });

export type WifiProps = z.output<typeof wifiSchema>;

function Row({
  label,
  value,
  copyLabel,
  mono,
}: {
  label: string;
  value: string;
  copyLabel: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <dt className={cn(mutedTextClass, "text-xs")}>{label}</dt>
        <dd className={cn("font-medium break-all", mono && "font-mono")}>
          {value}
        </dd>
      </div>
      <CopyButton label={copyLabel} value={value} />
    </div>
  );
}

export function WifiBlock({ id, props }: BlockRenderProps<WifiProps>) {
  const titleId = `${id}-title`;
  return (
    <section
      aria-labelledby={titleId}
      className={cn(surfaceClass, "space-y-4 p-5")}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-(--lp-primary) text-(--lp-primary-fg)">
          <Wifi aria-hidden="true" className="size-5" />
        </span>
        <h2 className="text-lg font-semibold" id={titleId}>
          {props.title || "Wi-Fi"}
        </h2>
      </div>
      <dl className="space-y-3">
        <Row
          copyLabel="Copy network name"
          label={props.hidden ? "Network (hidden)" : "Network"}
          value={props.ssid}
        />
        {props.security === "nopass" ? (
          <div>
            <dt className={cn(mutedTextClass, "text-xs")}>Password</dt>
            <dd className="font-medium">None, just connect</dd>
          </div>
        ) : (
          <Row
            copyLabel="Copy password"
            label="Password"
            mono
            value={props.password}
          />
        )}
      </dl>
      {props.note && (
        <p className={cn(mutedTextClass, "text-sm")}>{props.note}</p>
      )}
    </section>
  );
}

registerBlock({
  type: "wifi",
  category: "contact",
  label: "Wi-Fi",
  description: "Network name and password with copy buttons",
  icon: Wifi,
  schema: wifiSchema,
  defaults: { ssid: "Guest Wi-Fi", password: "", security: "nopass" },
  Render: WifiBlock,
  Editor: WifiEditor,
});
