"use client";

import { track } from "@repo/analytics";
import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Tick } from "@repo/design-system/components/icons";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import { ArrowRight, Copy, Flash, Setting4 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useState,
  useTransition,
} from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createQrCode,
  type QrCodeActionResult,
  updateQrCode,
} from "@/actions/qr-codes";
import {
  currentBuilderRequest,
  openPlaygroundBuilder,
} from "@/components/code-builder/in-place";
import { emitSound } from "@/components/editor/sound";
import { InfoHint } from "@/components/help/info-hint";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { markProgrammaticQrContent } from "@/lib/analytics/react";
import { usePostLoginAction } from "@/lib/hooks/use-post-login-action";
import { dashboardEntry } from "@/lib/workspace-paths";
import { useAuthStore } from "@/store/auth-store";
import { useQREditorStore } from "@/store/editor-store";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import type { UrlContent } from "@/types/qr-content";
import type { ThemeStyles } from "@/types/theme";
import { makeDynamicIntent, shouldResumeDynamic } from "./dynamic-resume";

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
  // QRdx put it there: not a code the visitor generated (qr_generated).
  markProgrammaticQrContent(code.shortLink);
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

export type MakeDynamicOutcome =
  | { kind: "linked"; code: LinkedDynamicCode; trimmed: boolean }
  | { kind: "limit"; message: string }
  | { kind: "signin" }
  | { kind: "error"; message: string };

/**
 * The one-click "Dynamic": saves a dynamic code for the address in this
 * design. `create` is the createQrCode server action (a fake in tests).
 */
export async function makeDynamic(
  input: { destination: string; styles: ThemeStyles; userId: string },
  create: typeof createQrCode = createQrCode,
): Promise<MakeDynamicOutcome> {
  const { style, trimmed } = styleForCode(input.styles);
  const result = await safely(() =>
    create({ destinationUrl: input.destination, style }, { via: "playground" }),
  );
  if (!result.success) {
    if (result.error.code === "LIMIT_REACHED") {
      return { kind: "limit", message: result.error.message };
    }
    if (result.error.code === "UNAUTHORIZED") return { kind: "signin" };
    return { kind: "error", message: result.error.message };
  }
  return {
    kind: "linked",
    trimmed,
    code: {
      id: result.data.id,
      shortLink: result.data.shortLink,
      destinationUrl: result.data.destinationUrl,
      userId: input.userId,
    },
  };
}

/** Shown when the plan's dynamic codes are used up. */
export function DynamicLimitCard({
  message,
  onUpgrade,
}: {
  message: string;
  onUpgrade: () => void;
}) {
  const t = useTranslations("editor.dynamicLinkToggle");
  return (
    <div className="bg-muted/50 space-y-2 rounded-lg p-3 text-xs">
      <p>{message}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onUpgrade} size="sm">
          {t("upgradeToPro")}
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={dashboardEntry("codes")}>{t("manageCodes")}</Link>
        </Button>
      </div>
    </div>
  );
}

const choiceItemClass =
  "h-auto flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left whitespace-normal data-[state=on]:border-foreground/40 data-[state=on]:bg-accent/60";

/**
 * Static or Dynamic, under a valid website address. Static encodes the
 * address itself; Dynamic saves a dynamic code and encodes its short link.
 * Signed out, Dynamic asks for sign-in and picks up again afterwards (the
 * "MAKE_DYNAMIC" post-login action, see dynamic-resume.ts), with the same
 * design and content, which the editor store keeps. Signed in, "Link
 * options…" opens the code builder over the editor for the domain,
 * back-half, folder and tags (creating the code, or editing the linked one).
 */
export function DynamicLinkToggle() {
  const t = useTranslations("editor.dynamicLinkToggle");
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
  const [resume, setResume] = useState<unknown>(null);

  // While the session loads, keep showing a saved link so the card doesn't
  // collapse and grow back; a different account unlinks it below.
  const linked =
    code &&
    (isSessionPending ? true : userId !== null && code.userId === userId)
      ? code
      : null;
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
      markProgrammaticQrContent(linked.shortLink);
      setValue(linked.shortLink);
    }
  }, [linked, value, setValue]);

  const forgetMissingCode = () => {
    unlink();
    setValue(url);
    toast.error(t("thisDynamicCodeIsNo"), {
      description: t("theQrCodeShowsYour"),
    });
  };

  const enable = () => {
    if (!destination) return;
    if (!userId) {
      openAuthDialog("signin", "MAKE_DYNAMIC", makeDynamicIntent(destination));
      return;
    }

    setLimitMessage(null);
    startTransition(async () => {
      const outcome = await makeDynamic({
        destination,
        styles: useQREditorStore.getState().themeState.styles,
        userId,
      });
      if (outcome.kind === "limit") {
        setLimitMessage(outcome.message);
        return;
      }
      if (outcome.kind === "signin") {
        openAuthDialog(
          "signin",
          "MAKE_DYNAMIC",
          makeDynamicIntent(destination),
        );
        return;
      }
      if (outcome.kind === "error") {
        toast.error(outcome.message);
        return;
      }

      link(outcome.code);
      // The short link isn't a code the visitor typed: no qr_generated.
      markProgrammaticQrContent(outcome.code.shortLink);
      setValue(outcome.code.shortLink);
      emitSound("success");
      track("dynamic_code_created", { source: "playground" });
      toast.success(t("yourQrCodeIsNow"), {
        description: outcome.trimmed
          ? t("changeWhereItPointsAt")
          : t("changeWhereItPointsAt2"),
      });
    });
  };

  // The builder over the editor: domain, back-half, folder, tags, routing.
  const openLinkOptions = () => {
    const next = currentBuilderRequest(userId);
    if (next.ok) openPlaygroundBuilder(next.request);
    else toast(next.reason);
  };

  // Back from sign-in with a pending "Dynamic" pick: run it once the session
  // and this form are both ready, for the destination it was made for.
  usePostLoginAction(
    "MAKE_DYNAMIC",
    useCallback((data?: unknown) => setResume(data ?? null), []),
  );
  const runResume = useEffectEvent(() => {
    const intent = resume;
    setResume(null);
    if (linked || !shouldResumeDynamic(intent, destination)) return;
    enable();
  });
  useEffect(() => {
    if (resume && userId) runResume();
  }, [resume, userId]);

  const disable = () => {
    unlink();
    setValue(url);
    toast("Back to a static QR code", {
      description: t("theDynamicCodeStaysIn"),
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
      toast.success(t("destinationUpdated"), {
        description: t("printedCopiesOfThisCode"),
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
      toast.success(t("designSavedToTheCode"), {
        description: trimmed
          ? t("yourLogoWasTooLarge")
          : t("dashboardPreviewsAndDownloadsUse"),
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
      toast.error(t("couldntCopyTheShortLink"));
    }
  };

  // Only a real website can become dynamic; until then there's no choice.
  if (!(linked || destination)) return null;

  const creating = isPending && !linked;

  return (
    <section aria-label={t("staticOrDynamicQrCode")} className="space-y-3">
      <div className="flex items-start gap-1.5">
        <ToggleGroup
          aria-label={t("staticOrDynamicQrCode")}
          className="grid flex-1 grid-cols-2 gap-2"
          onValueChange={(next) => {
            if (next === "dynamic" && !linked) enable();
            if (next === "static" && linked) disable();
          }}
          spacing={2}
          type="single"
          value={linked ? "dynamic" : "static"}
          variant="outline"
        >
          <ToggleGroupItem
            className={choiceItemClass}
            disabled={isPending}
            value="static"
          >
            <span className="text-sm font-medium">{t("static")}</span>
            <span className="text-muted-foreground text-xs font-normal">
              {t("fixedOncePrinted")}
            </span>
          </ToggleGroupItem>
          <ToggleGroupItem
            className={choiceItemClass}
            disabled={isPending || (isSessionPending && !linked)}
            value="dynamic"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {creating ? (
                <ModuleOrbit aria-hidden className="size-3.5" />
              ) : (
                <Flash
                  className="size-3.5"
                  variant={linked ? "Bold" : "Linear"}
                />
              )}
              {t("dynamic")}
            </span>
            <span className="text-muted-foreground text-xs font-normal">
              {t("editLaterCountScans")}
            </span>
          </ToggleGroupItem>
        </ToggleGroup>
        <InfoHint align="end" className="mt-2.5" id="dynamic-qr" />
      </div>

      {limitMessage && !linked && (
        <DynamicLimitCard message={limitMessage} onUpgrade={openGetProDialog} />
      )}

      {userId && !linked && (
        <Button
          className="text-muted-foreground hover:text-foreground -ml-2 h-7 px-2 text-xs"
          disabled={isPending}
          onClick={openLinkOptions}
          size="sm"
          variant="ghost"
        >
          <Setting4 className="size-3.5" />
          {t("linkOptions")}
        </Button>
      )}

      {linked && (
        <div className="space-y-3">
          <div className="bg-background flex h-9 min-w-0 items-center gap-2 rounded-full border pr-1 pl-3.5 shadow-xs">
            <code className="min-w-0 flex-1 truncate font-mono text-xs">
              {linked.shortLink.replace(/^https?:\/\//, "")}
            </code>
            <Button
              aria-label={copied ? t("shortLinkCopied") : t("copyShortLink")}
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

          {destinationChanged && (
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
              <p className="text-pretty">
                {t.rich("printedCodesStillOpenDestinationurl", {
                  destinationUrl: linked.destinationUrl,
                  span: (chunks) => (
                    <span className="font-medium break-all">{chunks}</span>
                  ),
                })}
              </p>
              <Button
                disabled={isPending}
                onClick={updateDestination}
                size="sm"
                variant="outline"
              >
                {isPending && <ModuleOrbit aria-hidden />}
                {t("pointItToTheNew")}
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2">
              <Button
                disabled={isPending}
                onClick={saveDesign}
                size="sm"
                variant="outline"
              >
                {designSaved ? (
                  <Tick />
                ) : isPending ? (
                  <ModuleOrbit aria-hidden />
                ) : null}
                {designSaved ? t("designSaved") : t("saveDesignToCode")}
              </Button>
              <Button
                disabled={isPending}
                onClick={openLinkOptions}
                size="sm"
                variant="outline"
              >
                <Setting4 />
                {t("linkOptions")}
              </Button>
            </div>
            <Button asChild className="-ml-2.5" size="sm" variant="ghost">
              <Link href={dashboardEntry(`codes/${linked.id}`)}>
                {t("scansSettings")}
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
