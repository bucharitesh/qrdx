"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import type { ReactNode } from "react";

export interface OpenConfirmation {
  title: string;
  description: ReactNode;
  action: string;
}

/** Opens a scanned link in a new tab, never on its own: always a tap, optionally confirmed. */
export function OpenButton({
  href,
  children,
  confirm,
  disabled,
  variant = "default",
}: {
  href: string;
  children: ReactNode;
  confirm?: OpenConfirmation | null;
  disabled?: boolean;
  variant?: "default" | "outline" | "destructive";
}) {
  const open = () => {
    if (/^https?:/i.test(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      // App links (upi:, bitcoin:, tel: ...) hand off to the app without a blank tab.
      window.location.assign(href);
    }
  };

  if (!confirm) {
    return (
      <Button
        disabled={disabled}
        onClick={open}
        size="sm"
        type="button"
        variant={variant}
      >
        {children}
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={disabled} size="sm" type="button" variant={variant}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="ph-no-capture">
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">{confirm.description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={open}>{confirm.action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
