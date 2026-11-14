"use client";

// A page shown as a modal over the page it was opened from (an intercepted
// route). Closing it goes back, so the URL and history stay right.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { cn } from "@repo/design-system/lib/utils";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function RouteModal({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <DialogContent
        // No description: nothing to point at (Radix warns otherwise)
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-3xl",
          className,
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
