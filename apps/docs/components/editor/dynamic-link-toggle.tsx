"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import Link from "next/link";
import { useEffect, useLayoutEffect, useState, useTransition } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createQrCode,
  type QrCodeActionResult,
  updateQrCode,
} from "@/actions/qr-codes";
import { CopyButton } from "@/components/copy-button";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useAuthStore } from "@/store/auth-store";
import { useQREditorStore } from "@/store/editor-store";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import type { UrlContent } from "@/types/qr-content";
import type { ThemeStyles } from "@/types/theme";

export interface LinkedDynamicCode {
  id: string;
  shortLink: string;
  destinationUrl: string;
  /** The account that linked it, so another sign-in on this browser never inherits it */
  userId: string;
}

interface DynamicLinkStore {
  code: LinkedDynamicCode | null;
  link: (code: LinkedDynamicCode) => void;
  unlink: () => void;
}

/** The dynamic code the playground's URL QR is currently bound to. */
export const useDynamicLinkStore = create<DynamicLinkStore>()(
  persist(
    (set) => ({
      code: null,
      link: (code) => set({ code }),
      unlink: () => set({ code: null }),
    }),
    { name: "dynamic-link-storage" },
  ),
);

/** Loads a dashboard code (design, destination, short link) into the playground editor. */
export function loadCodeIntoEditor(
  code: {
    id: string;
    shortLink: string;
    destinationUrl: string;
    style: ThemeStyles | null;
  },
  userId: string,
) {
  const editor = useQREditorStore.getState();
  editor.setContentType("url");
  editor.setContentConfig("url", { type: "url", url: code.destinationUrl });
  if (code.style) {
    editor.setThemeState({ ...editor.themeState, styles: code.style });
  }
  editor.setValue(code.shortLink);
  useDynamicLinkStore.getState().link({
    id: code.id,
    shortLink: code.shortLink,
    destinationUrl: code.destinationUrl,
    userId,
  });
}

/** https:// is assumed when the scheme is missing, as browsers do. */
export function normalizeDestination(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`,
    );
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// Server actions accept up to 1MB; a very large inline logo is left out of the saved design.
const MAX_SAVED_STYLE_LENGTH = 900_000;

function styleForCode(styles: ThemeStyles): {
  style: ThemeStyles;
  trimmed: boolean;
} {
  if (JSON.stringify(styles).length <= MAX_SAVED_STYLE_LENGTH) {
    return { style: styles, trimmed: false };
  }
  const { customLogo: _customLogo, ...rest } = styles;
  return { style: rest, trimmed: true };
}

/** Network failures and oversized payloads reject; surface them like any other error. */
async function safely<T>(
  call: () => Promise<QrCodeActionResult<T>>,
): Promise<QrCodeActionResult<T>> {
  try {
    return await call();
  } catch {
    return {
      success: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: "Couldn't reach QRdx. Check your connection and try again.",
      },
    };
  }
}

export function DynamicLinkToggle() {
  const isMounted = useMounted();
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();
  const userId = session?.user?.id ?? null;

  const url = useQREditorStore(
    (state) => (state.contentConfigs.url as UrlContent | undefined)?.url ?? "",
  );
  const value = useQREditorStore((state) => state.value);
  const setValue = useQREditorStore((state) => state.setValue);
  const code = useDynamicLinkStore((state) => state.code);
  const link = useDynamicLinkStore((state) => state.link);
  const unlink = useDynamicLinkStore((state) => state.unlink);
  const openAuthDialog = useAuthStore((state) => state.openAuthDialog);
  const openGetProDialog = useGetProDialogStore(
    (state) => state.openGetProDialog,
  );

  const [isPending, startTransition] = useTransition();
  const [limitMessage, setLimitMessage] = useState<string | null>(null);

  const linked = code && userId && code.userId === userId ? code : null;
  const destination = normalizeDestination(url);
  const destinationChanged =
    linked !== null &&
    destination !== null &&
    destination !== linked.destinationUrl;

  // Signed out or a different account: forget the link and show the plain URL again.
  useEffect(() => {
    if (isSessionPending || !code || code.userId === userId) return;
    unlink();
    if (useQREditorStore.getState().value === code.shortLink) setValue(url);
  }, [isSessionPending, code, userId, unlink, setValue, url]);

  // The URL form rewrites the value as you type; put the short link back before paint.
  useLayoutEffect(() => {
    if (linked && value !== linked.shortLink) {
      setValue(linked.shortLink);
    }
  }, [linked, value, setValue]);

  const forgetMissingCode = () => {
    unlink();
    setValue(url);
    toast.error("This dynamic code is no longer available", {
      description: "The QR code shows your URL directly again.",
    });
  };

  const enable = () => {
    if (!userId) {
      openAuthDialog("signin");
      return;
    }
    if (!destination) {
      toast.error("Enter a website address first");
      return;
    }

    setLimitMessage(null);
    const { style, trimmed } = styleForCode(
      useQREditorStore.getState().themeState.styles,
    );

    startTransition(async () => {
      const result = await safely(() =>
        createQrCode({ destinationUrl: destination, style }),
      );
      if (!result.success) {
        if (result.error.code === "LIMIT_REACHED") {
          setLimitMessage(result.error.message);
        } else if (result.error.code === "UNAUTHORIZED") {
          openAuthDialog("signin");
        } else {
          toast.error(result.error.message);
        }
        return;
      }

      link({
        id: result.data.id,
        shortLink: result.data.shortLink,
        destinationUrl: result.data.destinationUrl,
        userId,
      });
      setValue(result.data.shortLink);
      toast.success("Your QR code is now dynamic", {
        description: trimmed
          ? "Change where it points at any time. Your logo was too large to save with the code."
          : "Change where it points at any time from your dashboard.",
      });
    });
  };

  const disable = () => {
    unlink();
    setValue(url);
    toast("Back to a static QR code", {
      description: "The dynamic code stays in your dashboard.",
    });
  };

  const updateDestination = () => {
    if (!(linked && destination)) return;
    startTransition(async () => {
      const result = await safely(() =>
        updateQrCode({ id: linked.id, destinationUrl: destination }),
      );
      if (!result.success) {
        if (result.error.code === "NOT_FOUND") forgetMissingCode();
        else toast.error(result.error.message);
        return;
      }
      link({ ...linked, destinationUrl: result.data.destinationUrl });
      toast.success("Destination updated", {
        description: "Printed copies of this code now open the new URL.",
      });
    });
  };

  const saveDesign = () => {
    if (!linked) return;
    const { style, trimmed } = styleForCode(
      useQREditorStore.getState().themeState.styles,
    );
    startTransition(async () => {
      const result = await safely(() => updateQrCode({ id: linked.id, style }));
      if (!result.success) {
        if (result.error.code === "NOT_FOUND") forgetMissingCode();
        else toast.error(result.error.message);
        return;
      }
      toast.success("Design saved to the code", {
        description: trimmed
          ? "Your logo was too large to save and was left out."
          : "Dashboard previews and downloads use this design.",
      });
    });
  };

  if (!isMounted) return null;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <Label className="text-xs" htmlFor="dynamic-link-switch">
            Make it dynamic
          </Label>
          <p className="text-muted-foreground text-xs">
            Edit the link after printing and count every scan.
          </p>
        </div>
        <Switch
          checked={linked !== null}
          disabled={isPending || isSessionPending}
          id="dynamic-link-switch"
          onCheckedChange={(checked) => (checked ? enable() : disable())}
        />
      </div>

      {limitMessage && !linked && (
        <div className="bg-muted/50 space-y-2 rounded-md p-2 text-xs">
          <p>{limitMessage}</p>
          <div className="flex gap-2">
            <Button onClick={openGetProDialog} size="sm">
              Upgrade to Pro
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard">Manage codes</Link>
            </Button>
          </div>
        </div>
      )}

      {linked && (
        <div className="space-y-2 text-xs">
          <div className="flex min-w-0 items-center gap-1">
            <span className="text-muted-foreground shrink-0">Short link</span>
            <code className="bg-muted min-w-0 truncate rounded px-1.5 py-0.5">
              {linked.shortLink}
            </code>
            <CopyButton
              successMessage={{ title: "Short link copied" }}
              textToCopy={linked.shortLink}
            />
          </div>

          {destinationChanged && (
            <div className="bg-muted/50 space-y-2 rounded-md p-2">
              <p>
                The QR code still opens{" "}
                <span className="font-medium break-all">
                  {linked.destinationUrl}
                </span>
                .
              </p>
              <Button
                disabled={isPending}
                onClick={updateDestination}
                size="sm"
              >
                Point it to the new URL
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isPending}
              onClick={saveDesign}
              size="sm"
              variant="outline"
            >
              Save design to code
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/dashboard/codes/${encodeURIComponent(linked.id)}`}>
                Manage in dashboard
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
