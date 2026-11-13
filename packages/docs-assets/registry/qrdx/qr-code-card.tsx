"use client";

import { QRCode } from "qrdx";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/registry/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/registry/ui/card";

/** qrdx style options: colors, gradients, patterns, logo, template. */
export type QrCodeStyle = Omit<ComponentProps<typeof QRCode>, "value" | "size">;

export interface QrCodeCardProps extends Omit<ComponentProps<"div">, "title"> {
  /** Text or URL to encode. */
  value: string;
  /** Heading under the code. */
  title?: ReactNode;
  /** Supporting text under the heading. */
  description?: ReactNode;
  /**
   * Call to action printed on the frame. Pass `""` for a plain frame.
   * @default "Scan me"
   */
  cta?: string;
  /**
   * Where the frame label sits, or `"none"` for no frame.
   * @default "bottom"
   */
  frame?: "bottom" | "top" | "none";
  /** Extra classes for the frame, e.g. `"bg-primary text-primary-foreground"`. */
  frameClassName?: string;
  /**
   * Width and height of the code in pixels.
   * @default 168
   */
  size?: number;
  /** qrdx style options for the code. */
  qr?: QrCodeStyle;
  /** Accessible name. Defaults to "QR code: <value>". */
  label?: string;
  /** Footer content, such as buttons. */
  children?: ReactNode;
}

export function QrCodeCard({
  value,
  title,
  description,
  cta = "Scan me",
  frame = "bottom",
  frameClassName,
  size = 168,
  qr,
  label,
  className,
  children,
  ...props
}: QrCodeCardProps) {
  const code = (
    <div
      aria-label={label ?? `QR code: ${value}`}
      className="overflow-hidden rounded-[10px]"
      role="img"
      style={{ width: size, height: size }}
    >
      <QRCode margin={2} {...qr} size={size} value={value} />
    </div>
  );

  return (
    <Card
      className={cn("w-full max-w-xs items-center gap-5", className)}
      data-slot="qr-code-card"
      {...props}
    >
      <CardContent className="flex justify-center">
        {frame === "none" ? (
          <div className="rounded-[16px] border p-1.5">{code}</div>
        ) : (
          <div
            className={cn(
              "flex flex-col items-center rounded-[16px] bg-foreground p-1.5 text-background",
              frame === "top" && "flex-col-reverse",
              frameClassName,
            )}
          >
            {code}
            {cta ? (
              <span
                className={cn(
                  "px-3 font-semibold text-xs uppercase tracking-[0.2em]",
                  frame === "top" ? "pt-1 pb-2" : "pt-2 pb-1",
                )}
              >
                {cta}
              </span>
            ) : null}
          </div>
        )}
      </CardContent>
      {title || description ? (
        <CardHeader className="w-full justify-items-center text-center">
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description ? (
            <CardDescription className="text-balance">
              {description}
            </CardDescription>
          ) : null}
        </CardHeader>
      ) : null}
      {children ? (
        <CardFooter className="w-full flex-wrap justify-center gap-2">
          {children}
        </CardFooter>
      ) : null}
    </Card>
  );
}
