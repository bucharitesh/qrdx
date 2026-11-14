"use client";

import { CloseCircle, InfoCircle, TickCircle, Warning2 } from "iconsax-reactjs";
import type { ComponentProps } from "react";
import { ModuleOrbit } from "./loaders";
import { Toaster as BaseToaster } from "./ui/sonner";

/**
 * The app's toaster: ui/sonner's, with Module orbit as the loading icon.
 * Passing `icons` replaces the whole set, so the other four (the same as
 * ui/sonner's) are repeated here.
 */
export function Toaster({
  icons,
  ...props
}: ComponentProps<typeof BaseToaster>) {
  return (
    <BaseToaster
      icons={{
        success: <TickCircle className="size-4" />,
        info: <InfoCircle className="size-4" />,
        warning: <Warning2 className="size-4" />,
        error: <CloseCircle className="size-4" />,
        // The toast's own text is announced; the loader only shows it's busy.
        loading: <ModuleOrbit aria-hidden />,
        ...icons,
      }}
      {...props}
    />
  );
}
