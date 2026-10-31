"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Spinner, Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { useIsMobile } from "@repo/design-system/hooks/use-mobile";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight, Copy, Flash, Global } from "iconsax-reactjs";
import Link from "next/link";
import { useEffect, useLayoutEffect, useState, useTransition } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createQrCode,
  type QrCodeActionResult,
  updateQrCode,
} from "@/actions/qr-codes";
import { emitSound } from "@/components/editor/sound";
import { InfoHint } from "@/components/help/info-hint";
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

/**
 * On phones, a signed-out visitor gets the dynamic card at the end of the
 * Content tab (after "Start from a style") instead of under the address
 * field, so the sign-in prompt doesn't interrupt making a first code.
 * Signed in, or on larger screens, it stays under the field.
 */
export function useDynamicCardAtEnd(): boolean {
  const isMobile = useIsMobile();
  const { data: session, isPending } = authClient.useSession();
  return isMobile && !isPending && !session?.user;
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
  const [designSaved, setDesignSaved] = useState(false);
  const [copied, setCopied] = useState(false);

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
      emitSound("success");
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
      emitSound("apply");
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
      setDesignSaved(true);
      emitSound("apply");
      setTimeout(() => setDesignSaved(false), 2500);
      toast.success("Design saved to the code", {
        description: trimmed
          ? "Your logo was too large to save and was left out."
          : "Dashboard previews and downloads use this design.",
      });
    });
  };

  const copyShortLink = async () => {
    if (!linked) return;
    try {
      await navigator.clipboard.writeText(linked.shortLink);
      setCopied(true);
      emitSound("copy");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the short link");
    }
  };

  if (!isMounted) {
    return <div aria-hidden className="h-[7.5rem] rounded-xl border" />;
  }

  const destinationHost = (() => {
    try {
      return linked ? new URL(linked.destinationUrl).host : null;
    } catch {
      return null;
    }
  })();

  return (
    <section
      aria-labelledby="dynamic-code-title"
      className={cn(
        "space-y-3 rounded-xl border p-4 transition-colors",
        linked && "bg-accent/30",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="bg-muted/40 text-foreground/80 grid size-9 shrink-0 place-items-center rounded-full border">
          <Flash className="size-4" variant={linked ? "Bold" : "Linear"} />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <h3
            className="flex items-center gap-2 text-sm font-medium"
            id="dynamic-code-title"
          >
            Dynamic QR code
            <InfoHint align="start" id="dynamic-qr" />
            {linked && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-current" />
                On
              </span>
            )}
          </h3>
          <p className="text-muted-foreground text-xs text-pretty">
            {linked
              ? "The code points to a short link, so you can change the destination after printing."
              : "Change where it points after printing, and count every scan."}
          </p>
        </div>
      </div>

      {!linked && !userId && !isSessionPending && (
        <Button
          className="w-full"
          onClick={() => openAuthDialog("signin")}
          size="sm"
          variant="outline"
        >
          Sign in to make it dynamic
        </Button>
      )}

      {!linked && (userId || isSessionPending) && (
        <div className="space-y-2">
          <Button
            className="w-full"
            disabled={isPending || isSessionPending || !destination}
            onClick={enable}
            size="sm"
            variant="outline"
          >
            {isPending ? <Spinner /> : <Flash />}
            Make it dynamic
          </Button>
          {!destination && (
            <p className="text-muted-foreground text-center text-xs">
              Enter a website address first.
            </p>
          )}
        </div>
      )}

      {limitMessage && !linked && (
        <div className="bg-muted/50 space-y-2 rounded-lg p-3 text-xs">
          <p>{limitMessage}</p>
          <div className="flex flex-wrap gap-2">
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
        <div className="space-y-3">
          <div className="bg-background flex h-9 min-w-0 items-center gap-2 rounded-full border pr-1 pl-3.5 shadow-xs">
            <code className="min-w-0 flex-1 truncate font-mono text-xs">
              {linked.shortLink.replace(/^https?:\/\//, "")}
            </code>
            <Button
              aria-label={copied ? "Short link copied" : "Copy short link"}
              className="text-muted-foreground hover:text-foreground"
              onClick={copyShortLink}
              size="icon-sm"
              variant="ghost"
            >
              {copied ? (
                <Tick className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          </div>

          {destinationHost && !destinationChanged && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Global className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">
                Scans go to{" "}
                <span className="text-foreground">{destinationHost}</span>
              </span>
            </p>
          )}

          {destinationChanged && (
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
              <p className="text-pretty">
                Printed codes still open{" "}
                <span className="font-medium break-all">
                  {linked.destinationUrl}
                </span>
                .
              </p>
              <Button
                disabled={isPending}
                onClick={updateDestination}
                size="sm"
                variant="outline"
              >
                {isPending && <Spinner />}
                Point it to the new address
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={isPending}
              onClick={saveDesign}
              size="sm"
              variant="outline"
            >
              {designSaved ? <Tick /> : isPending ? <Spinner /> : null}
              {designSaved ? "Design saved" : "Save design to code"}
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/dashboard/codes/${encodeURIComponent(linked.id)}`}>
                Scans & settings
                <ArrowRight />
              </Link>
            </Button>
            <Button
              className="text-muted-foreground ml-auto"
              disabled={isPending}
              onClick={disable}
              size="sm"
              variant="ghost"
            >
              Turn off
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
