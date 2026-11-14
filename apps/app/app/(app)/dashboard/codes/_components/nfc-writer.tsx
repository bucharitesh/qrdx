"use client";

import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import {
  Danger,
  type Icon,
  Lock,
  Mobile,
  Refresh,
  TickCircle,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import {
  canLockTags,
  classifyNfcError,
  isWebNfcAvailable,
  lockTag,
  NFC_FAILURE_MESSAGES,
  type NfcFailure,
  writeUrlToTag,
} from "@/lib/nfc/web-nfc";
import { soundEvent } from "@/lib/sound/emit";

type WriterState =
  | { step: "ready" }
  | { step: "writing" }
  | { step: "written" }
  | { step: "write-failed"; failure: NfcFailure }
  | { step: "locking" }
  | { step: "locked" }
  | { step: "lock-failed"; failure: NfcFailure };

type Support = "checking" | "supported" | "unsupported";

/** Failures a retry on the same tag can't fix. */
const NEEDS_ANOTHER_TAG: ReadonlySet<NfcFailure> = new Set([
  "locked",
  "too-small",
  "unsupported",
]);

/** Web NFC support, read after mount so server and client render the same. */
export function useWebNfcSupport(): { support: Support; canLock: boolean } {
  const [value, setValue] = useState<{ support: Support; canLock: boolean }>({
    support: "checking",
    canLock: false,
  });
  useEffect(() => {
    setValue(
      isWebNfcAvailable()
        ? { support: "supported", canLock: canLockTags() }
        : { support: "unsupported", canLock: false },
    );
  }, []);
  return value;
}

function Status({
  icon: StatusIcon,
  spinning,
  tone = "default",
  title,
  children,
}: {
  icon?: Icon;
  spinning?: boolean;
  tone?: "default" | "error";
  title: string;
  children: ReactNode;
}) {
  return (
    <div aria-live="polite" className="flex items-start gap-3" role="status">
      <span
        className={cn(
          "bg-muted flex size-10 shrink-0 items-center justify-center rounded-full",
          tone === "error" && "bg-destructive/10 text-destructive",
        )}
      >
        {spinning ? (
          <Spinner className="size-5" />
        ) : StatusIcon ? (
          <StatusIcon className="size-5" />
        ) : null}
      </span>
      <div className="min-w-0 space-y-0.5 pt-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{children}</p>
      </div>
    </div>
  );
}

/**
 * Writes `url` to an NFC tag with Web NFC, then offers to lock the tag. Only
 * rendered where the browser supports it (see useWebNfcSupport).
 */
export function NfcWriter({ url, canLock }: { url: string; canLock: boolean }) {
  const t = useTranslations("app.dashboard.codes.nfcWriter");
  const [state, setState] = useState<WriterState>({ step: "ready" });
  const [understood, setUnderstood] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const confirmId = useId();

  // Leaving the page stops waiting for a tag.
  useEffect(() => () => controller.current?.abort(), []);

  const begin = () => {
    controller.current?.abort();
    controller.current = new AbortController();
    return controller.current.signal;
  };

  const write = async () => {
    const signal = begin();
    setState({ step: "writing" });
    try {
      await writeUrlToTag(url, { signal });
      setState({ step: "written" });
      setUnderstood(false);
      soundEvent("success");
      track("nfc_tag_written", { result: "written" });
    } catch (error) {
      const failure = classifyNfcError(error);
      if (failure === "aborted") {
        setState({ step: "ready" });
        return;
      }
      setState({ step: "write-failed", failure });
      soundEvent("error");
      track("nfc_tag_written", { result: "failed", error: failure });
    }
  };

  const lock = async () => {
    const signal = begin();
    setState({ step: "locking" });
    try {
      await lockTag({ signal });
      setState({ step: "locked" });
      soundEvent("success");
      track("nfc_tag_written", { result: "locked" });
    } catch (error) {
      const failure = classifyNfcError(error);
      if (failure === "aborted") {
        setState({ step: "written" });
        return;
      }
      setState({ step: "lock-failed", failure });
      soundEvent("error");
      track("nfc_tag_written", { result: "failed", error: failure });
    }
  };

  const cancel = () => controller.current?.abort();

  switch (state.step) {
    case "ready":
      return (
        <div className="space-y-4">
          <Status icon={Mobile} title={t("readyToWrite")}>
            {t("tapWriteToNfcTag")}
          </Status>
          <Button className="w-full sm:w-auto" onClick={write}>
            {t("writeToNfcTag")}
          </Button>
        </div>
      );
    case "writing":
    case "locking":
      return (
        <div className="space-y-4">
          <Status
            spinning
            title={
              state.step === "writing"
                ? t("holdTheTagNearThe")
                : t("holdTheSameTagNear")
            }
          >
            {t("keepItStillAgainstThe")}{" "}
            {state.step === "writing" ? t("written2") : t("locked2")}.
          </Status>
          <Button
            className="w-full sm:w-auto"
            onClick={cancel}
            variant="outline"
          >
            {t("cancel")}
          </Button>
        </div>
      );
    case "write-failed":
    case "lock-failed": {
      const message = NFC_FAILURE_MESSAGES[state.failure];
      return (
        <div className="space-y-4">
          <Status icon={Danger} title={message.title} tone="error">
            {message.description}
          </Status>
          <Button
            className="w-full sm:w-auto"
            onClick={state.step === "write-failed" ? write : lock}
            variant="outline"
          >
            <Refresh />
            {NEEDS_ANOTHER_TAG.has(state.failure)
              ? t("tryAnotherTag")
              : t("tryAgain")}
          </Button>
        </div>
      );
    }
    case "locked":
      return (
        <div className="space-y-4">
          <Status icon={Lock} title={t("locked")}>
            {t("thisTagIsReadOnly")}
          </Status>
          <Button
            className="w-full sm:w-auto"
            onClick={write}
            variant="outline"
          >
            {t("writeAnotherTag")}
          </Button>
        </div>
      );
    case "written":
      return (
        <div className="space-y-5">
          <Status icon={TickCircle} title={t("written")}>
            {t("testItTapTheTag")}
          </Status>
          <Button
            className="w-full sm:w-auto"
            onClick={write}
            variant="outline"
          >
            {t("writeAnotherTag")}
          </Button>
          {canLock && (
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {t("lockTheTagOptionalPermanent")}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t("aLockedTagCanNever")}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={understood}
                  id={confirmId}
                  onCheckedChange={(value) => setUnderstood(value === true)}
                />
                <Label className="text-sm leading-snug" htmlFor={confirmId}>
                  {t("iUnderstandThisTagCan")}
                </Label>
              </div>
              <Button
                className="w-full sm:w-auto"
                disabled={!understood}
                onClick={lock}
                variant="destructive"
              >
                <Lock />
                {t("lockThisTag")}
              </Button>
            </div>
          )}
        </div>
      );
  }
}
