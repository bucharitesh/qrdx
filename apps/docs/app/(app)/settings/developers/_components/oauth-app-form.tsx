"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { OAuthAppLogo } from "@/components/oauth/oauth-app-logo";
import { UploadButton } from "@/lib/files/components/upload-button";
import {
  MAX_APP_DESCRIPTION_LENGTH,
  MAX_APP_NAME_LENGTH,
  MAX_REDIRECT_URIS,
  type OAuthAppInput,
  oauthAppInputSchema,
} from "@/lib/oauth-apps/validation";
import {
  OAUTH_SCOPE_INFO,
  OAUTH_SCOPES,
  type OAuthScope,
} from "@/lib/oauth-scopes";

export interface OAuthAppFormValues {
  name: string;
  description: string;
  logoUrl: string;
  websiteUrl: string;
  redirectUris: string;
  scopes: OAuthScope[];
  pkceRequired: boolean;
}

export const EMPTY_APP_VALUES: OAuthAppFormValues = {
  name: "",
  description: "",
  logoUrl: "",
  websiteUrl: "",
  redirectUris: "",
  scopes: ["profile:read"],
  pkceRequired: true,
};

export function toFormValues(app: {
  name: string;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  redirectUris: string[];
  scopes: OAuthScope[];
  pkceRequired: boolean;
}): OAuthAppFormValues {
  return {
    name: app.name,
    description: app.description ?? "",
    logoUrl: app.logoUrl ?? "",
    websiteUrl: app.websiteUrl ?? "",
    redirectUris: app.redirectUris.join("\n"),
    scopes: app.scopes,
    pkceRequired: app.pkceRequired,
  };
}

function toInput(values: OAuthAppFormValues): OAuthAppInput {
  return {
    name: values.name,
    description: values.description,
    logoUrl: values.logoUrl,
    websiteUrl: values.websiteUrl,
    redirectUris: values.redirectUris.split("\n"),
    scopes: values.scopes,
    pkceRequired: values.pkceRequired,
  };
}

function FieldHint({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-xs">{children}</p>;
}

/**
 * Create or edit an app. Validated here with the server's own schema, so
 * mistakes show before the round trip; the server checks everything again.
 */
export function OAuthAppForm({
  initial,
  submitLabel,
  pendingLabel,
  storageEnabled,
  disabled = false,
  verified = false,
  onSubmit,
}: {
  initial: OAuthAppFormValues;
  submitLabel: string;
  pendingLabel: string;
  /** File storage (R2) is configured: logos can be uploaded */
  storageEnabled: boolean;
  disabled?: boolean;
  /** Shows that changing the public details drops the verified badge */
  verified?: boolean;
  onSubmit: (input: OAuthAppInput) => Promise<string | null>;
}) {
  const id = useId();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = <K extends keyof OAuthAppFormValues>(
    key: K,
    value: OAuthAppFormValues[K],
  ) => setValues((current) => ({ ...current, [key]: value }));

  const toggleScope = (scope: OAuthScope, checked: boolean) =>
    set(
      "scopes",
      checked
        ? [...values.scopes.filter((item) => item !== scope), scope]
        : values.scopes.filter((item) => item !== scope),
    );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input = toInput(values);
    const parsed = oauthAppInputSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      setError(await onSubmit(input));
    } finally {
      setPending(false);
    }
  };

  const locked = disabled || pending;

  return (
    <form className="space-y-6" onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>App details</CardTitle>
          <CardDescription>
            What people see on the QRdx consent screen when your app asks for
            access.
            {verified &&
              " Changing the name, logo or website removes the verified badge until QRdx reviews the app again."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-start gap-4">
            <OAuthAppLogo
              logoUrl={values.logoUrl.trim() || null}
              name={values.name || "App"}
              size="lg"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor={`${id}-logo`}>Logo</Label>
              <div className="flex flex-wrap items-start gap-2">
                <Input
                  autoComplete="off"
                  className="min-w-0 flex-1"
                  disabled={locked}
                  id={`${id}-logo`}
                  inputMode="url"
                  onChange={(event) => set("logoUrl", event.target.value)}
                  placeholder="https://example.com/logo.png"
                  spellCheck={false}
                  type="url"
                  value={values.logoUrl}
                />
                {storageEnabled && (
                  <UploadButton
                    disabled={locked}
                    kinds={["image"]}
                    onUploaded={([file]) => file && set("logoUrl", file.url)}
                    variant="outline"
                  >
                    Upload
                  </UploadButton>
                )}
              </div>
              <FieldHint>
                A square image, at least 128 × 128 px.
                {storageEnabled
                  ? " Uploads are saved to this workspace's files."
                  : " Paste an https:// link to the image."}
              </FieldHint>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              autoComplete="off"
              disabled={locked}
              id={`${id}-name`}
              maxLength={MAX_APP_NAME_LENGTH}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Acme for QRdx"
              required
              value={values.name}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${id}-description`}>Description</Label>
            <Textarea
              disabled={locked}
              id={`${id}-description`}
              maxLength={MAX_APP_DESCRIPTION_LENGTH}
              onChange={(event) => set("description", event.target.value)}
              placeholder="Sync your QR codes and scans to Acme."
              rows={2}
              value={values.description}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${id}-website`}>Website</Label>
            <Input
              autoComplete="off"
              disabled={locked}
              id={`${id}-website`}
              inputMode="url"
              onChange={(event) => set("websiteUrl", event.target.value)}
              placeholder="https://acme.com"
              spellCheck={false}
              type="url"
              value={values.websiteUrl}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>OAuth</CardTitle>
          <CardDescription>
            Where QRdx sends people back to, and what your app may do.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor={`${id}-redirects`}>Redirect URIs</Label>
            <Textarea
              className="font-mono text-xs md:text-xs"
              disabled={locked}
              id={`${id}-redirects`}
              onChange={(event) => set("redirectUris", event.target.value)}
              placeholder={
                "https://acme.com/oauth/qrdx/callback\nhttp://localhost:3000/callback"
              }
              rows={3}
              spellCheck={false}
              value={values.redirectUris}
            />
            <FieldHint>
              One per line, up to {MAX_REDIRECT_URIS}. Authorization requests
              must send one of them exactly. https:// only, except
              http://localhost for development. No wildcards or fragments.
            </FieldHint>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Scopes</legend>
            {OAUTH_SCOPES.map((scope) => {
              const checkboxId = `${id}-scope-${scope}`;
              return (
                <label
                  className="hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[button:disabled]:cursor-not-allowed has-[button:disabled]:opacity-60"
                  htmlFor={checkboxId}
                  key={scope}
                >
                  <Checkbox
                    checked={values.scopes.includes(scope)}
                    className="mt-0.5"
                    disabled={locked}
                    id={checkboxId}
                    onCheckedChange={(next) =>
                      toggleScope(scope, next === true)
                    }
                  />
                  <span className="min-w-0 space-y-0.5">
                    <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                      {OAUTH_SCOPE_INFO[scope].label}
                      <code className="text-muted-foreground font-mono text-xs font-normal">
                        {scope}
                      </code>
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {OAUTH_SCOPE_INFO[scope].consent}
                    </span>
                  </span>
                </label>
              );
            })}
            <FieldHint>
              The most your app can request. Each authorization asks for some or
              all of them in its <code className="font-mono">scope</code>{" "}
              parameter.
            </FieldHint>
          </fieldset>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor={`${id}-pkce`}>Require PKCE</Label>
              <FieldHint>
                Every authorization must send a{" "}
                <code className="font-mono">code_challenge</code> with{" "}
                <code className="font-mono">S256</code>, and the token request
                its <code className="font-mono">code_verifier</code>.
                Recommended.
              </FieldHint>
            </div>
            <Switch
              checked={values.pkceRequired}
              disabled={locked}
              id={`${id}-pkce`}
              onCheckedChange={(checked) => set("pkceRequired", checked)}
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {!disabled && (
        <div className="flex justify-end">
          <Button disabled={pending} type="submit">
            {pending ? pendingLabel : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
