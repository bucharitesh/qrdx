"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { DialogFooter } from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/design-system/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import {
  API_KEY_EXPIRY_DAYS,
  API_KEY_PRESETS,
  type ApiKeyAccess,
  type ApiKeyExpiryDays,
  type ApiKeyInput,
  apiKeyInputSchema,
} from "@/lib/api-keys/shared";
import {
  OAUTH_SCOPE_INFO,
  OAUTH_SCOPES,
  type OAuthScope,
} from "@/lib/oauth-scopes";

const ACCESS_OPTIONS: { value: ApiKeyAccess; label: string; help: string }[] = [
  {
    value: "full",
    label: "Full access",
    help: "Create and change codes, hooks and conversions.",
  },
  {
    value: "read",
    label: "Read only",
    help: "Read codes, scans, themes and your profile.",
  },
  { value: "custom", label: "Custom", help: "Choose the scopes yourself." },
];

const EXPIRY_LABELS: Record<ApiKeyExpiryDays, string> = {
  30: "30 days",
  90: "90 days",
  365: "1 year",
};
const NEVER = "never";

export function CreateApiKeyForm({
  defaultName,
  onSubmit,
  onCancel,
}: {
  defaultName: string;
  /** Resolves to an error message, or null once the key exists. */
  onSubmit: (input: ApiKeyInput) => Promise<string | null>;
  onCancel: () => void;
}) {
  const t = useTranslations("app.settings.developers.createApiKeyForm");
  const id = useId();
  const [name, setName] = useState(defaultName);
  const [access, setAccess] = useState<ApiKeyAccess>("full");
  const [custom, setCustom] = useState<OAuthScope[]>(["codes:read"]);
  const [expiry, setExpiry] = useState<string>(NEVER);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const scopes = access === "custom" ? custom : [...API_KEY_PRESETS[access]];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input: ApiKeyInput = {
      name,
      scopes,
      expiresInDays:
        expiry === NEVER ? null : (Number(expiry) as ApiKeyExpiryDays),
    };
    const parsed = apiKeyInputSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form.");
      return;
    }
    setPending(true);
    setError(null);
    const message = await onSubmit(input);
    setPending(false);
    if (message) setError(message);
  };

  return (
    <form className="space-y-5" noValidate onSubmit={submit}>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-name`}>{t("name")}</Label>
        <Input
          autoComplete="off"
          autoFocus
          id={`${id}-name`}
          maxLength={64}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("productionServer")}
          value={name}
        />
        <p className="text-muted-foreground text-xs">
          {t("whereTheKeyIsUsed")}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">{t("access")}</legend>
        <RadioGroup
          className="gap-2"
          onValueChange={(value) => setAccess(value as ApiKeyAccess)}
          value={access}
        >
          {ACCESS_OPTIONS.map((option) => (
            <Label
              className="hover:bg-muted/40 has-[[data-state=checked]]:border-foreground/30 flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal"
              htmlFor={`${id}-${option.value}`}
              key={option.value}
            >
              <RadioGroupItem
                className="mt-0.5"
                id={`${id}-${option.value}`}
                value={option.value}
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">
                  {option.label}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {option.help}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        {access === "custom" && (
          <div className="grid gap-2 pt-1 pl-1 sm:grid-cols-2">
            {OAUTH_SCOPES.map((scope) => (
              <Label
                className="flex cursor-pointer items-center gap-2 text-sm font-normal"
                htmlFor={`${id}-scope-${scope}`}
                key={scope}
              >
                <Checkbox
                  checked={custom.includes(scope)}
                  id={`${id}-scope-${scope}`}
                  onCheckedChange={(checked) =>
                    setCustom((current) =>
                      checked === true
                        ? [...current, scope]
                        : current.filter((s) => s !== scope),
                    )
                  }
                />
                <span>
                  {OAUTH_SCOPE_INFO[scope].label}{" "}
                  <code className="text-muted-foreground font-mono text-xs">
                    {scope}
                  </code>
                </span>
              </Label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-expiry`}>{t("expires")}</Label>
        <Select onValueChange={setExpiry} value={expiry}>
          <SelectTrigger className="w-full" id={`${id}-expiry`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NEVER}>{t("never")}</SelectItem>
            {API_KEY_EXPIRY_DAYS.map((days) => (
              <SelectItem key={days} value={String(days)}>
                {EXPIRY_LABELS[days]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button
          disabled={pending}
          onClick={onCancel}
          type="button"
          variant="outline"
        >
          {t("cancel")}
        </Button>
        <Button disabled={pending} type="submit">
          {pending ? t("creating") : t("createKey")}
        </Button>
      </DialogFooter>
    </form>
  );
}
