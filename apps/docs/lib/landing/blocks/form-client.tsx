"use client";

import { Star } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import {
  InfoCircle as CircleAlert,
  TickCircle as CircleCheck,
} from "iconsax-reactjs";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { buttonClass, mutedTextClass } from "@/components/landing/block-kit";
import { type FormField, validateAnswers } from "./form-fields";

// Visitor-facing form of a form block. Posts same-origin to
// /api/forms/<pageId> (so it works on custom domains), with a Cloudflare
// Turnstile token when the server has Turnstile keys.

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const TURNSTILE_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: Record<string, unknown>,
  ) => string | undefined;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Loads Turnstile on first use (not on page load) and tracks its token. */
function useTurnstile(siteKey: string | undefined) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const load = useCallback(() => {
    if (!siteKey || widgetRef.current) return;
    const render = () => {
      if (!window.turnstile || widgetRef.current || !containerRef.current) {
        return;
      }
      widgetRef.current =
        window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          appearance: "interaction-only",
          callback: (token: string) => {
            tokenRef.current = token;
          },
          "expired-callback": () => {
            tokenRef.current = null;
          },
          "error-callback": () => {
            tokenRef.current = null;
          },
        }) ?? null;
    };
    if (window.turnstile) {
      render();
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(
      "script[data-qrdx-turnstile]",
    );
    if (!script) {
      script = document.createElement("script");
      script.src = TURNSTILE_SRC;
      script.async = true;
      script.dataset.qrdxTurnstile = "";
      document.head.appendChild(script);
    }
    script.addEventListener("load", render, { once: true });
  }, [siteKey]);

  /** Resolves with a token (waits up to ~10s for the check to finish). */
  const getToken = useCallback(async (): Promise<string | null> => {
    if (!siteKey) return null;
    load();
    for (let i = 0; i < 50 && !tokenRef.current; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return tokenRef.current;
  }, [load, siteKey]);

  const reset = useCallback(() => {
    tokenRef.current = null;
    if (widgetRef.current && window.turnstile) {
      window.turnstile.reset(widgetRef.current);
    }
  }, []);

  useEffect(
    () => () => {
      if (widgetRef.current && window.turnstile) {
        window.turnstile.remove(widgetRef.current);
      }
    },
    [],
  );

  return { containerRef, load, getToken, reset, enabled: Boolean(siteKey) };
}

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "sent" }
  | { kind: "closed" }
  | { kind: "notice"; message: string };

const inputClass =
  "block w-full rounded-[calc(var(--lp-radius)*0.75)] border border-(--lp-fg)/20 bg-(--lp-bg) px-3 py-2.5 text-base text-(--lp-fg) placeholder:text-(--lp-muted-fg) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--lp-primary) aria-invalid:border-[#ef4444]";

const optionClass =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-[calc(var(--lp-radius)*0.75)] border border-(--lp-fg)/15 bg-(--lp-bg) px-3 py-2 text-[15px] has-checked:border-(--lp-primary) has-focus-visible:outline-2 has-focus-visible:outline-(--lp-primary)";

function FieldShell({
  field,
  inputId,
  error,
  group,
  children,
}: {
  field: FormField;
  inputId: string;
  error?: string;
  /** Radio/checkbox groups use fieldset + legend */
  group?: boolean;
  children: ReactNode;
}) {
  const label = (
    <>
      {field.label}
      {field.required && (
        <span aria-hidden="true" className="text-(--lp-primary)">
          {" "}
          *
        </span>
      )}
    </>
  );
  const footer = (
    <>
      {field.help && (
        <p className={cn(mutedTextClass, "text-xs")} id={`${inputId}-help`}>
          {field.help}
        </p>
      )}
      {error && (
        <p
          className="flex items-center gap-1.5 text-sm font-medium"
          id={`${inputId}-error`}
        >
          <CircleAlert
            aria-hidden="true"
            className="size-4 shrink-0 text-[#ef4444]"
          />
          {error}
        </p>
      )}
    </>
  );
  if (group) {
    return (
      <fieldset
        aria-describedby={describedBy(field, inputId, error)}
        className="min-w-0 space-y-2"
      >
        <legend className="mb-2 text-sm font-medium">{label}</legend>
        {children}
        {footer}
      </fieldset>
    );
  }
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium" htmlFor={inputId}>
        {label}
      </label>
      {children}
      {footer}
    </div>
  );
}

const describedBy = (field: FormField, inputId: string, error?: string) =>
  [field.help && `${inputId}-help`, error && `${inputId}-error`]
    .filter(Boolean)
    .join(" ") || undefined;

function FieldInput({
  field,
  value,
  error,
  onChange,
  disabled,
}: {
  field: FormField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  disabled: boolean;
}) {
  const inputId = useId();
  const invalid = error ? true : undefined;
  const common = {
    id: inputId,
    name: field.id,
    disabled,
    "aria-invalid": invalid,
    "aria-required": field.required || undefined,
    "aria-describedby": describedBy(field, inputId, error),
  };

  switch (field.type) {
    case "text":
      return (
        <FieldShell error={error} field={field} inputId={inputId}>
          {field.multiline ? (
            <textarea
              {...common}
              className={cn(inputClass, "min-h-24 resize-y")}
              maxLength={field.maxLength}
              onChange={(event) => onChange(event.target.value)}
              placeholder={field.placeholder}
              rows={4}
              value={typeof value === "string" ? value : ""}
            />
          ) : (
            <input
              {...common}
              className={inputClass}
              maxLength={field.maxLength}
              onChange={(event) => onChange(event.target.value)}
              placeholder={field.placeholder}
              type="text"
              value={typeof value === "string" ? value : ""}
            />
          )}
        </FieldShell>
      );
    case "email":
    case "phone":
      return (
        <FieldShell error={error} field={field} inputId={inputId}>
          <input
            {...common}
            autoComplete={field.type === "email" ? "email" : "tel"}
            className={inputClass}
            inputMode={field.type === "email" ? "email" : "tel"}
            maxLength={field.type === "email" ? 254 : 32}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder}
            type={field.type === "email" ? "email" : "tel"}
            value={typeof value === "string" ? value : ""}
          />
        </FieldShell>
      );
    case "stars": {
      const current = typeof value === "number" ? value : 0;
      return (
        <FieldShell error={error} field={field} group inputId={inputId}>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: field.max }, (_, index) => {
              const score = index + 1;
              return (
                <label
                  className="grid size-11 cursor-pointer place-items-center rounded-full has-focus-visible:outline-2 has-focus-visible:outline-(--lp-primary)"
                  key={score}
                >
                  <input
                    checked={current === score}
                    className="sr-only"
                    disabled={disabled}
                    name={`${inputId}-stars`}
                    onChange={() => onChange(score)}
                    type="radio"
                    value={score}
                  />
                  <Star
                    aria-hidden="true"
                    className={cn(
                      "size-8 transition-colors",
                      score <= current
                        ? "text-(--lp-primary)"
                        : "text-(--lp-fg)/30",
                    )}
                    variant={score <= current ? "Bold" : "Linear"}
                  />
                  <span className="sr-only">
                    {score} of {field.max} stars
                  </span>
                </label>
              );
            })}
          </div>
        </FieldShell>
      );
    }
    case "nps":
      return (
        <FieldShell error={error} field={field} group inputId={inputId}>
          <div className="grid grid-cols-6 gap-1.5 min-[400px]:grid-cols-11">
            {Array.from({ length: 11 }, (_, score) => (
              <label
                className="grid h-11 cursor-pointer place-items-center rounded-[calc(var(--lp-radius)*0.5)] border border-(--lp-fg)/15 bg-(--lp-bg) text-sm font-medium tabular-nums has-checked:border-(--lp-primary) has-checked:bg-(--lp-primary) has-checked:text-(--lp-primary-fg) has-focus-visible:outline-2 has-focus-visible:outline-(--lp-primary)"
                key={score}
              >
                <input
                  checked={value === score}
                  className="sr-only"
                  disabled={disabled}
                  name={`${inputId}-nps`}
                  onChange={() => onChange(score)}
                  type="radio"
                  value={score}
                />
                {score}
              </label>
            ))}
          </div>
          <div
            className={cn(mutedTextClass, "flex justify-between gap-4 text-xs")}
          >
            <span>0 · {field.lowLabel}</span>
            <span className="text-right">10 · {field.highLabel}</span>
          </div>
        </FieldShell>
      );
    case "choice": {
      const selected = field.multiple
        ? Array.isArray(value)
          ? (value as string[])
          : []
        : value;
      return (
        <FieldShell error={error} field={field} group inputId={inputId}>
          <div className="grid gap-2">
            {field.options.map((option) => {
              const checked = field.multiple
                ? (selected as string[]).includes(option)
                : selected === option;
              return (
                <label className={optionClass} key={option}>
                  <input
                    checked={checked}
                    className="size-4 shrink-0 accent-(--lp-primary)"
                    disabled={disabled}
                    name={`${inputId}-choice`}
                    onChange={(event) => {
                      if (!field.multiple) {
                        onChange(option);
                        return;
                      }
                      const list = selected as string[];
                      onChange(
                        event.target.checked
                          ? field.options.filter(
                              (candidate) =>
                                candidate === option ||
                                list.includes(candidate),
                            )
                          : list.filter((item) => item !== option),
                      );
                    }}
                    type={field.multiple ? "checkbox" : "radio"}
                    value={option}
                  />
                  {option}
                </label>
              );
            })}
          </div>
        </FieldShell>
      );
    }
    case "consent":
      return (
        <div className="space-y-1.5">
          <label className="flex cursor-pointer items-start gap-3 text-[15px]">
            <input
              {...common}
              checked={value === true}
              className="mt-0.5 size-4 shrink-0 accent-(--lp-primary)"
              onChange={(event) => onChange(event.target.checked)}
              type="checkbox"
            />
            <span>
              {field.label}
              {field.required && (
                <span aria-hidden="true" className="text-(--lp-primary)">
                  {" "}
                  *
                </span>
              )}
            </span>
          </label>
          {field.help && (
            <p className={cn(mutedTextClass, "text-xs")} id={`${inputId}-help`}>
              {field.help}
            </p>
          )}
          {error && (
            <p
              className="flex items-center gap-1.5 text-sm font-medium"
              id={`${inputId}-error`}
            >
              <CircleAlert
                aria-hidden="true"
                className="size-4 shrink-0 text-[#ef4444]"
              />
              {error}
            </p>
          )}
        </div>
      );
  }
}

export function FormClient({
  blockId,
  fields,
  submitLabel,
  successMessage,
  pageId,
  qrCodeId,
  live,
  demo = false,
  shapeClassName,
}: {
  blockId: string;
  fields: FormField[];
  submitLabel: string;
  successMessage: string;
  pageId: string | null;
  qrCodeId: string | null;
  /** false in the editor preview: nothing is sent */
  live: boolean;
  /** Template demo: validates, then shows the thank-you state; never sends */
  demo?: boolean;
  /** buttonShapeClass(theme) */
  shapeClassName?: string;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const honeypotRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const checkedRef = useRef(false);
  const turnstile = useTurnstile(
    live && !demo ? TURNSTILE_SITE_KEY : undefined,
  );
  const endpoint = pageId ? `/api/forms/${encodeURIComponent(pageId)}` : null;

  // First interaction: load the spam check and ask whether the form is open,
  // so visitors learn it's closed before typing a long answer.
  const onFirstInteraction = () => {
    if (!live || demo || !endpoint || checkedRef.current) return;
    checkedRef.current = true;
    turnstile.load();
    fetch(`${endpoint}?block=${encodeURIComponent(blockId)}`)
      .then((response) =>
        response.ok || response.status === 403 ? response.json() : null,
      )
      .then((data: { accepting?: boolean; code?: string } | null) => {
        if (data?.accepting === false || data?.code === "FORM_CLOSED") {
          setStatus({ kind: "closed" });
        }
      })
      .catch(() => {});
  };

  const focusFirstError = (fieldErrors: Record<string, string>) => {
    if (!fields.some((field) => fieldErrors[field.id])) return;
    // After the errors render: the first invalid input, or the first option
    // of an invalid radio/checkbox group.
    requestAnimationFrame(() => {
      formRef.current
        ?.querySelector<HTMLElement>(
          '[aria-invalid="true"], fieldset[aria-describedby$="-error"] input',
        )
        ?.focus();
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status.kind === "submitting" || status.kind === "closed") return;
    const result = validateAnswers(fields, values);
    if (!result.success) {
      setErrors(result.errors);
      focusFirstError(result.errors);
      return;
    }
    setErrors({});
    if (result.answers.length === 0) {
      setStatus({
        kind: "notice",
        message: "Answer at least one question before sending.",
      });
      return;
    }
    if (demo) {
      setStatus({ kind: "sent" });
      return;
    }
    if (!live || !endpoint) {
      setStatus({
        kind: "notice",
        message:
          "This is a preview. Responses are collected on the published page.",
      });
      return;
    }

    setStatus({ kind: "submitting" });
    const token = turnstile.enabled ? await turnstile.getToken() : null;
    if (turnstile.enabled && !token) {
      setStatus({
        kind: "notice",
        message: "Please complete the security check above, then send again.",
      });
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          block: blockId,
          qrCodeId,
          answers: values,
          token,
          hp: honeypotRef.current?.value ?? "",
        }),
      });
      if (response.ok) {
        setStatus({ kind: "sent" });
        return;
      }
      const data = (await response.json().catch(() => null)) as {
        code?: string;
        message?: string;
        data?: { fields?: Record<string, string> };
      } | null;
      turnstile.reset();
      if (data?.code === "FORM_CLOSED") {
        setStatus({ kind: "closed" });
      } else if (data?.data?.fields) {
        setErrors(data.data.fields);
        focusFirstError(data.data.fields);
        setStatus({ kind: "idle" });
      } else {
        setStatus({
          kind: "notice",
          message:
            response.status === 429
              ? "Too many responses from this device. Please wait a minute and try again."
              : (response.status === 400 && data?.message) ||
                "Your response couldn't be sent. Please try again.",
        });
      }
    } catch {
      setStatus({
        kind: "notice",
        message:
          "You seem to be offline. Your answers are still here; try again in a moment.",
      });
    }
  };

  if (status.kind === "sent") {
    return (
      <output className="flex flex-col items-center gap-2 py-6 text-center">
        <CircleCheck
          aria-hidden="true"
          className="size-8 text-(--lp-primary)"
        />
        <span className="text-[15px] font-medium whitespace-pre-line">
          {successMessage}
        </span>
        {demo && (
          <span className={cn(mutedTextClass, "text-sm")}>
            Demo: nothing is sent.
          </span>
        )}
      </output>
    );
  }

  const closed = status.kind === "closed";
  return (
    <form
      className="space-y-5"
      noValidate
      onFocusCapture={onFirstInteraction}
      onPointerDownCapture={onFirstInteraction}
      onSubmit={submit}
      ref={formRef}
    >
      {fields.map((field) => (
        <FieldInput
          disabled={status.kind === "submitting"}
          error={errors[field.id]}
          field={field}
          key={field.id}
          onChange={(value) => {
            setValues((current) => ({ ...current, [field.id]: value }));
            if (errors[field.id]) {
              setErrors(({ [field.id]: _, ...rest }) => rest);
            }
          }}
          value={values[field.id]}
        />
      ))}

      {/* Honeypot: invisible to people, filled in by naive bots. Named so
          browsers and password managers don't autofill it. */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] h-px w-px overflow-hidden"
      >
        <label>
          Leave this field empty
          <input
            autoComplete="off"
            data-1p-ignore=""
            data-lpignore="true"
            name="qrdx_hp"
            ref={honeypotRef}
            tabIndex={-1}
            type="text"
          />
        </label>
      </div>

      {turnstile.enabled && <div ref={turnstile.containerRef} />}

      <output aria-live="polite" className="block empty:hidden">
        {closed && (
          <span className="block rounded-(--lp-radius) border border-(--lp-fg)/15 px-4 py-3 text-sm">
            This form isn't accepting responses right now. Please try again
            later.
          </span>
        )}
        {status.kind === "notice" && (
          <span className="block text-sm font-medium">{status.message}</span>
        )}
      </output>

      <button
        className={cn(
          buttonClass("filled", shapeClassName),
          "disabled:opacity-60",
        )}
        disabled={status.kind === "submitting" || closed}
        type="submit"
      >
        {status.kind === "submitting" ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}
