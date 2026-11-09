"use client";

import { authClient } from "@repo/auth/client";
import {
  GithubLogo,
  GoogleLogo,
  Spinner,
} from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/design-system/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@repo/design-system/components/ui/input-otp";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowDown2,
  Building,
  ExportSquare,
  FingerScan,
} from "iconsax-reactjs";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  CONFIRM_RETURN_FAILED,
  CONFIRM_RETURNED,
  CONFIRMATION_ACTIONS,
  CONFIRMATION_CODE_MINUTES,
  CONFIRMATION_MESSAGES,
  CONFIRMATION_MINUTES,
  CONFIRMATION_REASONS,
  CONFIRMATION_RESEND_SECONDS,
  type ConfirmationAction,
  type ConfirmationOptions,
  type ConfirmMethod,
  type ConfirmSignInProvider,
  confirmReturnPath,
  isConfirmSignInProvider,
} from "@/lib/account/confirmation";
import {
  normalizeBackupCode,
  TWO_FACTOR_MESSAGES,
} from "@/lib/auth/two-factor";
import { browserHasPasskeys } from "@/lib/passkeys";
import { signInPath } from "@/lib/safe-redirect";
import {
  confirmWithCode,
  confirmWithEmailCode,
  confirmWithPasskey,
  getConfirmationOptions,
  sendConfirmationCode,
  startPasskeyConfirmation,
  startSignInConfirmation,
} from "./actions";
import { DialogCloseButton } from "./dialog-close-button";
import {
  type AssertionOptionsJSON,
  getPasskeyAssertion,
  PasskeyPromptError,
} from "./webauthn";

const CODE_LENGTH = 6;
const DIGITS_ONLY = "^\\d+$";
// The last method that worked in this browser (no secrets: just its name).
const REMEMBERED_METHOD = "qrdx:confirm-method";

const SWITCH_LABELS: Record<ConfirmMethod, string> = {
  passkey: "Use your passkey",
  totp: "Use an authenticator code",
  backup: "Use a backup code",
  email: "Email me a code",
  google: "Sign in with Google",
  github: "Sign in with GitHub",
  sso: "Sign in with SSO",
  "sign-in-again": "Sign in again",
};

const SIGN_IN_NAMES: Record<ConfirmSignInProvider, string> = {
  google: "Google",
  github: "GitHub",
  sso: "your company's SSO",
};

const SIGN_IN_ICONS: Record<
  ConfirmSignInProvider,
  (props: { className?: string }) => ReactNode
> = {
  google: ({ className }) => <GoogleLogo className={className} />,
  github: ({ className }) => <GithubLogo className={className} />,
  sso: ({ className }) => <Building aria-hidden className={className} />,
};

const TEXT_ACTION =
  "rounded-sm text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:no-underline";

function rememberedMethod(): ConfirmMethod | null {
  try {
    return window.localStorage.getItem(
      REMEMBERED_METHOD,
    ) as ConfirmMethod | null;
  } catch {
    return null;
  }
}

function remember(method: ConfirmMethod) {
  try {
    window.localStorage.setItem(REMEMBERED_METHOD, method);
  } catch {
    // Private mode or storage off: next time starts from the default.
  }
}

/**
 * What worked last in this browser, else the first (the passkey, when the
 * account has one and it works here).
 */
function firstMethod(methods: ConfirmMethod[]): ConfirmMethod | null {
  const last = rememberedMethod();
  if (last && methods.includes(last)) return last;
  return methods[0] ?? null;
}

/** Keeps its children's height, animated, so switching steps doesn't jump. */
function AnimatedHeight({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = inner.current;
    if (!element) return;
    const measure = () => setHeight(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      className="-m-1 overflow-hidden transition-[height] duration-200 ease-out motion-reduce:transition-none"
      style={height === null ? undefined : { height: height + 8 }}
    >
      <div className="p-1" ref={inner}>
        {children}
      </div>
    </div>
  );
}

function SixDigits({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  label,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  disabled: boolean;
  invalid: boolean;
  label: string;
  describedBy: string;
}) {
  return (
    <InputOTP
      aria-describedby={describedBy}
      aria-label={label}
      autoComplete="one-time-code"
      autoFocus
      containerClassName="justify-center gap-3"
      disabled={disabled}
      inputMode="numeric"
      maxLength={CODE_LENGTH}
      onChange={onChange}
      onComplete={onComplete}
      pattern={DIGITS_ONLY}
      value={value}
    >
      {[0, 3].map((start) => (
        <InputOTPGroup key={start}>
          {[start, start + 1, start + 2].map((index) => (
            <InputOTPSlot
              aria-invalid={invalid}
              className="h-11 w-11 text-lg font-medium tabular-nums"
              index={index}
              key={index}
            />
          ))}
        </InputOTPGroup>
      ))}
    </InputOTP>
  );
}

export interface ConfirmationRequest {
  action: ConfirmationAction;
}

/**
 * "Confirm it's you" (lib/account/confirmation.ts). Opened by
 * useConfirmation() when a gated action answers CONFIRMATION_REQUIRED;
 * `onDone(true)` once the server recorded a confirmation, `onDone(false)`
 * when cancelled.
 */
export function ConfirmIdentityDialog({
  request,
  onDone,
}: {
  request: ConfirmationRequest | null;
  onDone: (confirmed: boolean) => void;
}) {
  const id = useId();
  const open = request !== null;
  const [options, setOptions] = useState<ConfirmationOptions | null>(null);
  const [methods, setMethods] = useState<ConfirmMethod[]>([]);
  const [method, setMethod] = useState<ConfirmMethod | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  // The passkey prompt opens on its own once per dialog; after that it's
  // the button.
  const autoStarted = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const opening = useRef(0);
  const [loadedFor, setLoadedFor] = useState(0);

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const resetAnswer = () => {
    setError(null);
    setNotice(null);
    setCode("");
    setBackupCode("");
  };

  // A fresh start each time it opens. Each opening is numbered, and the
  // passkey prompt only starts once this opening's options are in: the
  // first render of an opening still holds the last one's method.
  useEffect(() => {
    if (!open) return;
    opening.current += 1;
    const current = opening.current;
    setOptions(null);
    setMethods([]);
    setMethod(null);
    setChoosing(false);
    setLoadError(null);
    setEmailSent(false);
    setResendAt(0);
    setError(null);
    setNotice(null);
    setCode("");
    setBackupCode("");
    autoStarted.current = false;
    let cancelled = false;
    getConfirmationOptions()
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setLoadError(result.error);
          return;
        }
        // Passkeys need WebAuthn in this browser too.
        const usable = result.options.methods.filter(
          (entry) => entry !== "passkey" || browserHasPasskeys(),
        );
        setOptions(result.options);
        setMethods(usable);
        setMethod(firstMethod(usable));
        setLoadedFor(current);
      })
      .catch(() => {
        if (!cancelled) setLoadError(CONFIRMATION_MESSAGES.failed);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= resendAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  const succeed = useCallback(
    (used: ConfirmMethod) => {
      remember(used);
      onDone(true);
    },
    [onDone],
  );

  const runPasskey = useCallback(
    async (automatic: boolean) => {
      setBusy(true);
      setError(null);
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      try {
        const started = await startPasskeyConfirmation();
        if (!started.ok) {
          setError(started.error);
          return;
        }
        if (!("options" in started)) {
          setError(CONFIRMATION_MESSAGES.passkeyFailed);
          return;
        }
        let response: Awaited<ReturnType<typeof getPasskeyAssertion>>;
        try {
          response = await getPasskeyAssertion(
            started.options as unknown as AssertionOptionsJSON,
            controller.signal,
          );
        } catch (failure) {
          if (controller.signal.aborted) return;
          const reason =
            failure instanceof PasskeyPromptError ? failure.reason : "failed";
          // A browser that won't open the prompt without a click (Safari)
          // gets the button, not an error.
          if (automatic && reason === "not-allowed") return;
          setError(
            reason === "not-allowed"
              ? CONFIRMATION_MESSAGES.passkeyClosed
              : reason === "unsupported"
                ? CONFIRMATION_MESSAGES.passkeyUnavailable
                : CONFIRMATION_MESSAGES.passkeyFailed,
          );
          return;
        }
        const result = await confirmWithPasskey({ response });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        succeed("passkey");
      } catch {
        setError(CONFIRMATION_MESSAGES.failed);
      } finally {
        if (abort.current === controller) abort.current = null;
        setBusy(false);
      }
    },
    [succeed],
  );

  // The passkey prompt opens on its own when it's the method shown (once the
  // options for this opening are in).
  useEffect(() => {
    if (
      !open ||
      loadedFor !== opening.current ||
      method !== "passkey" ||
      autoStarted.current
    ) {
      return;
    }
    autoStarted.current = true;
    void runPasskey(true);
  }, [open, loadedFor, method, runPasskey]);

  // Closing the dialog (or switching away) stops a prompt still open.
  useEffect(() => {
    if (open && method === "passkey") return;
    abort.current?.abort();
  }, [open, method]);

  const submitTotp = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await confirmWithCode({ code: value });
      if (!result.ok) {
        setCode("");
        setError(result.error);
        return;
      }
      succeed("totp");
    } catch {
      setCode("");
      setError(CONFIRMATION_MESSAGES.failed);
    } finally {
      setBusy(false);
    }
  };

  const submitBackup = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!normalizeBackupCode(backupCode)) {
      setError(TWO_FACTOR_MESSAGES.invalidBackupCode);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await confirmWithCode({ code: backupCode });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      succeed("backup");
    } catch {
      setError(CONFIRMATION_MESSAGES.failed);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async (resend: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await sendConfirmationCode();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const time = Date.now();
      setNow(time);
      setResendAt(time + CONFIRMATION_RESEND_SECONDS * 1000);
      setCode("");
      setEmailSent(true);
      if (resend) setNotice("New code sent. The old one no longer works.");
    } catch {
      setError(CONFIRMATION_MESSAGES.failed);
    } finally {
      setBusy(false);
    }
  };

  const submitEmailCode = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await confirmWithEmailCode({ code: value });
      if (!result.ok) {
        setCode("");
        setError(result.error);
        if (result.codeDead) {
          setEmailSent(false);
          setResendAt(0);
        }
        return;
      }
      succeed("email");
    } catch {
      setCode("");
      setError(CONFIRMATION_MESSAGES.failed);
    } finally {
      setBusy(false);
    }
  };

  // Signing in again with a linked Google, GitHub or SSO account: the
  // server notes who asked, then the browser goes to the provider and comes
  // back to this page, where the provider finishes it (./provider.tsx).
  const signInAgainWith = async (provider: ConfirmSignInProvider) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const started = await startSignInConfirmation({ provider });
      if (!started.ok) {
        setError(started.error);
        setBusy(false);
        return;
      }
      remember(provider);
      const callbackURL = confirmReturnPath(
        window.location.href,
        CONFIRM_RETURNED,
      );
      const errorCallbackURL = confirmReturnPath(
        window.location.href,
        CONFIRM_RETURN_FAILED,
      );
      if (provider === "sso") {
        const { data, error: failure } = await authClient.signIn.sso({
          email: started.email,
          callbackURL,
          errorCallbackURL,
        });
        if (failure || !data?.url) throw failure ?? new Error("No SSO URL");
        window.location.href = data.url;
        return;
      }
      const { error: failure } = await authClient.signIn.social({
        provider,
        callbackURL,
        errorCallbackURL,
      });
      if (failure) throw failure;
      // The browser is on its way to the provider: stay busy.
    } catch {
      setError(CONFIRMATION_MESSAGES.signInFailed);
      setBusy(false);
    }
  };

  const signOutToSignIn = async () => {
    await authClient.signOut().catch(() => {});
    window.location.assign(signInPath(window.location.pathname));
  };

  const switchTo = (next: ConfirmMethod) => {
    abort.current?.abort();
    resetAnswer();
    setChoosing(false);
    setMethod(next);
    // Picking the passkey is the click some browsers need.
    if (next === "passkey") {
      autoStarted.current = true;
      void runPasskey(false);
    }
  };

  const close = () => {
    abort.current?.abort();
    onDone(false);
  };

  const errorId = `${id}-error`;
  const errorLine = (
    <p
      aria-live="polite"
      className="text-destructive text-center text-sm text-pretty empty:hidden"
      id={errorId}
      role={error ? "alert" : undefined}
    >
      {error}
    </p>
  );
  const others = methods.filter((entry) => entry !== method);
  const action = request ? CONFIRMATION_ACTIONS[request.action] : "";
  const reason = request ? CONFIRMATION_REASONS[request.action] : undefined;

  let body: ReactNode;
  if (loadError) {
    body = (
      <p className="text-destructive text-sm text-pretty" role="alert">
        {loadError}
      </p>
    );
  } else if (!(options && method)) {
    body = (
      <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
        <Spinner className="size-4 animate-spin" />
        Loading…
      </div>
    );
  } else if (choosing) {
    body = (
      <div className="space-y-2">
        <p className="text-sm font-medium">Choose another way</p>
        <div className="grid gap-2">
          {others.map((entry) => (
            <Button
              className="h-10 justify-start"
              key={entry}
              onClick={() => switchTo(entry)}
              type="button"
              variant="outline"
            >
              {SWITCH_LABELS[entry]}
            </Button>
          ))}
        </div>
      </div>
    );
  } else if (method === "passkey") {
    body = (
      <div className="flex flex-col items-center gap-3 py-1 text-center">
        <span className="bg-muted/60 flex size-11 items-center justify-center rounded-full border">
          <FingerScan aria-hidden className="size-5" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium">Use your passkey</p>
          <p className="text-muted-foreground text-xs text-pretty">
            {busy
              ? "Follow the prompt from your browser or device."
              : "Touch ID, Face ID, Windows Hello or a security key."}
          </p>
        </div>
        <Button
          className="h-10 w-full sm:h-9"
          disabled={busy}
          onClick={() => void runPasskey(false)}
          type="button"
        >
          {busy && <Spinner className="animate-spin" />}
          Continue with passkey
        </Button>
        {errorLine}
      </div>
    );
  } else if (method === "totp") {
    body = (
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm font-medium" id={`${id}-totp-label`}>
          Enter the code from your authenticator app
        </p>
        <SixDigits
          describedBy={errorId}
          disabled={busy}
          invalid={Boolean(error) && !code}
          label="Code from your authenticator app"
          onChange={(value) => {
            setCode(value);
            if (value) setError(null);
          }}
          onComplete={(value) => void submitTotp(value)}
          value={code}
        />
        <div className="flex min-h-5 items-center justify-center">
          {busy ? (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Spinner className="size-3.5 animate-spin" />
              Checking code…
            </p>
          ) : (
            errorLine
          )}
        </div>
      </div>
    );
  } else if (method === "backup") {
    body = (
      <form className="space-y-3" noValidate onSubmit={submitBackup}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${id}-backup`}>
            Backup code
          </label>
          <Input
            aria-describedby={`${id}-backup-hint ${errorId}`}
            aria-invalid={Boolean(error)}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            autoFocus
            className="h-10 font-mono tracking-wider sm:h-9"
            disabled={busy}
            id={`${id}-backup`}
            onChange={(event) => {
              setBackupCode(event.target.value);
              setError(null);
            }}
            placeholder="ABCDE-FGH23"
            spellCheck={false}
            value={backupCode}
          />
          <p
            className="text-muted-foreground text-xs text-pretty"
            id={`${id}-backup-hint`}
          >
            One of the codes you saved when you turned on two-step verification.
            Each works once.
          </p>
        </div>
        {errorLine}
        <Button
          className="h-10 w-full sm:h-9"
          disabled={busy || !backupCode.trim()}
          type="submit"
        >
          {busy && <Spinner className="animate-spin" />}
          Confirm
        </Button>
      </form>
    );
  } else if (method === "email") {
    body = emailSent ? (
      <div className="flex flex-col items-center gap-3">
        <p className="text-muted-foreground text-center text-sm text-pretty">
          Enter the code we sent to{" "}
          <span className="text-foreground font-medium">
            {options.maskedEmail}
          </span>
          . It expires in {CONFIRMATION_CODE_MINUTES} minutes.
        </p>
        <SixDigits
          describedBy={`${errorId} ${id}-email-status`}
          disabled={busy}
          invalid={Boolean(error) && !code}
          label="Code from the email"
          onChange={(value) => {
            setCode(value);
            if (value) setError(null);
          }}
          onComplete={(value) => void submitEmailCode(value)}
          value={code}
        />
        {errorLine}
        <div
          className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1"
          id={`${id}-email-status`}
        >
          <p className="text-muted-foreground text-xs">
            {notice ?? "Didn't get it? "}
            {!notice && (
              <button
                className={cn(
                  TEXT_ACTION,
                  "-my-3 inline-flex min-h-10 items-center tabular-nums sm:min-h-0",
                )}
                disabled={busy || secondsLeft > 0}
                onClick={() => void sendCode(true)}
                type="button"
              >
                {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Resend code"}
              </button>
            )}
          </p>
          {options.mailProvider && (
            <a
              className={cn(
                TEXT_ACTION,
                "-my-3 inline-flex min-h-10 items-center gap-1 sm:min-h-0",
              )}
              href={options.mailProvider.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {options.mailProvider.label}
              <ExportSquare aria-hidden className="size-3" />
            </a>
          )}
        </div>
      </div>
    ) : (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm text-pretty">
          We'll email a 6-digit code to{" "}
          <span className="text-foreground font-medium">
            {options.maskedEmail}
          </span>
          .
        </p>
        {errorLine}
        <Button
          className="h-10 w-full sm:h-9"
          disabled={busy}
          onClick={() => void sendCode(false)}
          type="button"
        >
          {busy && <Spinner className="animate-spin" />}
          Send code
        </Button>
      </div>
    );
  } else if (isConfirmSignInProvider(method)) {
    const Icon = SIGN_IN_ICONS[method];
    body = (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm text-pretty">
          Sign in with {SIGN_IN_NAMES[method]} again. You'll come back to this
          page, then make your change once more.
        </p>
        {errorLine}
        <Button
          className="h-10 w-full sm:h-9"
          disabled={busy}
          onClick={() => void signInAgainWith(method)}
          type="button"
          variant="outline"
        >
          {busy ? (
            <Spinner className="animate-spin" />
          ) : (
            <Icon className="size-4" />
          )}
          Continue with {method === "sso" ? "SSO" : SIGN_IN_NAMES[method]}
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm text-pretty">
          {CONFIRMATION_MESSAGES.signInAgain}
        </p>
        <Button
          className="h-10 w-full sm:h-9"
          onClick={signOutToSignIn}
          type="button"
          variant="outline"
        >
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) close();
      }}
      open={open}
    >
      <DialogContent
        className="gap-5 sm:max-w-[420px]"
        // The prompt (passkey) or a code field takes focus itself.
        onOpenAutoFocus={(event) => event.preventDefault()}
        showCloseButton={false}
      >
        <DialogCloseButton />
        <DialogHeader>
          <DialogTitle>Confirm it's you</DialogTitle>
          <DialogDescription className="text-pretty">
            Before you {action}, we need to check it's you.
          </DialogDescription>
        </DialogHeader>

        <AnimatedHeight>{body}</AnimatedHeight>

        <Collapsible className="group/why">
          <CollapsibleTrigger className="text-muted-foreground hover:text-foreground -my-2 flex min-h-10 items-center gap-1 rounded-sm text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 sm:my-0">
            {reason ? "Why am I asked?" : "Why am I asked again?"}
            <ArrowDown2
              aria-hidden
              className="size-3 transition-transform group-data-[state=open]/why:rotate-180 motion-reduce:transition-none"
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="text-muted-foreground pt-2 text-xs text-pretty">
            {reason ?? (
              <>
                We check it's you before changes to your account's security. It
                lasts {CONFIRMATION_MINUTES} minutes, so a few changes in a row
                only ask once.
              </>
            )}
          </CollapsibleContent>
        </Collapsible>

        <DialogFooter className="items-stretch sm:items-center sm:justify-between">
          {others.length > 0 && !choosing ? (
            <Button
              className="h-10 sm:h-9"
              disabled={busy && method !== "passkey"}
              onClick={() => {
                abort.current?.abort();
                setChoosing(true);
                setError(null);
              }}
              type="button"
              variant="ghost"
            >
              Use another method
            </Button>
          ) : choosing ? (
            <Button
              className="h-10 sm:h-9"
              onClick={() => setChoosing(false)}
              type="button"
              variant="ghost"
            >
              Back
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <Button
            className="h-10 sm:h-9"
            onClick={close}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
