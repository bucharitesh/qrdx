"use client";

import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { TickCircle } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import {
  type EnterpriseFormState,
  submitEnterpriseRequest,
} from "@/actions/enterprise-requests";
import { LocaleLink } from "@/components/i18n/locale-link";
import { TurnstileWidget } from "@/components/safety/turnstile-widget";
import {
  ENTERPRISE_HONEYPOT_FIELD,
  ENTERPRISE_FIELD_LIMITS as LIMITS,
  TEAM_SIZES,
} from "@/lib/enterprise";
import { soundEvent } from "@/lib/sound/emit";

// The contact form on /enterprise (actions/enterprise-requests.ts). Shown
// only where the form is offered; the page shows the plain address too.

const initialState: EnterpriseFormState = { status: "idle" };

const FIELDS = ["name", "email", "company", "teamSize", "need"] as const;
type Field = (typeof FIELDS)[number];

export function EnterpriseContactForm({
  email,
  locale,
  turnstileSiteKey,
}: {
  /** QRdx's address, for the errors that point at it */
  email: string;
  /** The page's language, so the reply can match it */
  locale: string;
  turnstileSiteKey: string | null;
}) {
  const t = useTranslations("enterprise.form");
  const [state, formAction, isPending] = useActionState(
    submitEnterpriseRequest,
    initialState,
  );
  // Controlled, so React's automatic form reset keeps them after an error.
  const [values, setValues] = useState<Record<Field, string>>({
    name: "",
    email: "",
    company: "",
    teamSize: "",
    need: "",
  });
  // Turnstile tokens are single-use: a fresh one after every attempt.
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (state.status === "idle") return;
    setAttempts((count) => count + 1);
    soundEvent(state.status === "sent" ? "success" : "error");
  }, [state]);

  const set = (name: Field) => (value: string) =>
    setValues((current) => ({ ...current, [name]: value }));

  if (state.status === "sent") {
    return (
      <div
        aria-live="polite"
        className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-8 text-center"
      >
        <TickCircle aria-hidden className="size-8 text-foreground/80" />
        <h3 className="text-lg font-medium text-secondary-foreground">
          {t("sentTitle")}
        </h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t("sent", { email: state.email })}
        </p>
      </div>
    );
  }

  const error = state.status === "error" ? state : null;
  const errorText = error
    ? error.code === "invalid"
      ? t(`errors.${error.field ?? "need"}`)
      : error.code === "check"
        ? t("errors.check")
        : t(`errors.${error.code}`, { email })
    : null;
  const invalid = (name: Field) =>
    error?.code === "invalid" && error.field === name ? true : undefined;
  const describedBy = (name: Field) =>
    invalid(name) ? "enterprise-form-error" : undefined;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-sm"
    >
      <input name="locale" type="hidden" value={locale} />
      {/* Off-screen and skipped by keyboards and password managers: only
          bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label htmlFor="enterprise-website">Website</label>
        <input
          autoComplete="off"
          id="enterprise-website"
          name={ENTERPRISE_HONEYPOT_FIELD}
          tabIndex={-1}
          type="text"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="enterprise-name">{t("name")}</Label>
          <Input
            aria-describedby={describedBy("name")}
            aria-invalid={invalid("name")}
            autoComplete="name"
            id="enterprise-name"
            maxLength={LIMITS.name}
            name="name"
            onChange={(event) => set("name")(event.target.value)}
            required
            value={values.name}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="enterprise-email">{t("email")}</Label>
          <Input
            aria-describedby={describedBy("email")}
            aria-invalid={invalid("email")}
            autoComplete="email"
            id="enterprise-email"
            maxLength={LIMITS.email}
            name="email"
            onChange={(event) => set("email")(event.target.value)}
            required
            type="email"
            value={values.email}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="enterprise-company">{t("company")}</Label>
          <Input
            aria-describedby={describedBy("company")}
            aria-invalid={invalid("company")}
            autoComplete="organization"
            id="enterprise-company"
            maxLength={LIMITS.company}
            name="company"
            onChange={(event) => set("company")(event.target.value)}
            required
            value={values.company}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="enterprise-size">{t("teamSize")}</Label>
          <Select
            name="teamSize"
            onValueChange={set("teamSize")}
            required
            value={values.teamSize}
          >
            <SelectTrigger
              aria-describedby={describedBy("teamSize")}
              aria-invalid={invalid("teamSize")}
              className="w-full"
              id="enterprise-size"
            >
              <SelectValue placeholder={t("teamSizePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {TEAM_SIZES.map((size) => (
                <SelectItem key={size} value={size}>
                  {t(`sizes.${size}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="enterprise-need">{t("need")}</Label>
        <Textarea
          aria-describedby={describedBy("need")}
          aria-invalid={invalid("need")}
          id="enterprise-need"
          maxLength={LIMITS.need}
          name="need"
          onChange={(event) => set("need")(event.target.value)}
          placeholder={t("needPlaceholder")}
          required
          rows={5}
          value={values.need}
        />
      </div>

      {turnstileSiteKey && (
        <TurnstileWidget resetKey={attempts} siteKey={turnstileSiteKey} />
      )}

      {errorText && (
        <p
          className="text-sm text-destructive"
          id="enterprise-form-error"
          role="alert"
        >
          {errorText}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {t.rich("privacy", {
            privacy: (chunks) => (
              <LocaleLink
                className="underline decoration-foreground/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
                href="/legal/privacy-policy"
              >
                {chunks}
              </LocaleLink>
            ),
          })}
        </p>
        <Button className="shrink-0" disabled={isPending} type="submit">
          {isPending && <Spinner aria-hidden className="animate-spin" />}
          {isPending ? t("sending") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
