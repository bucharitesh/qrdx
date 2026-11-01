"use client";

import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import type { IntegrationApiKeyConfig } from "@repo/integrations";
import { ExportSquare, Lock1 } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { emitSound } from "@/components/editor/sound";
import { track } from "@/lib/analytics";
import { connectWithApiKeyAction } from "../../connected-account-actions";

interface ApiKeyConnectProps {
  slug: string;
  name: string;
  apiKey: IntegrationApiKeyConfig;
  /** Shown above the form when OAuth is the main way in (Bitly). */
  asAlternative?: boolean;
  reconnect?: boolean;
}

/** Paste-a-key connection: checked with the provider, stored encrypted. */
export function ApiKeyConnect({
  slug,
  name,
  apiKey,
  asAlternative = false,
  reconnect = false,
}: ApiKeyConnectProps) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await connectWithApiKeyAction(slug, value);
      if (result.ok) {
        setValue("");
        emitSound("success");
        track("integration_connected", { provider: slug });
        toast.success(`${name} connected`);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Couldn't connect. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="space-y-4 rounded-xl border bg-card p-6" onSubmit={submit}>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">
          {asAlternative
            ? `Or connect with a ${apiKey.label.toLowerCase()}`
            : reconnect
              ? `Replace your ${apiKey.label.toLowerCase()}`
              : `Connect with your ${apiKey.label.toLowerCase()}`}
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">
          {apiKey.helpText}{" "}
          <a
            className="inline-flex items-center gap-1 font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
            href={apiKey.helpUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open {name}
            <ExportSquare aria-hidden className="size-3.5" />
          </a>
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={id}>{apiKey.label}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-describedby={error ? `${id}-error` : `${id}-hint`}
            aria-invalid={Boolean(error) || undefined}
            autoComplete="off"
            className="font-mono sm:flex-1"
            id={id}
            onChange={(event) => setValue(event.target.value)}
            placeholder={apiKey.placeholder}
            spellCheck={false}
            type="password"
            value={value}
          />
          <Button disabled={pending || value.trim().length < 8} type="submit">
            {pending && <Spinner className="size-4 animate-spin" />}
            {reconnect ? "Save" : "Connect"}
          </Button>
        </div>
        {error ? (
          <p
            className="text-destructive text-xs"
            id={`${id}-error`}
            role="alert"
          >
            {error}
          </p>
        ) : (
          <p
            className="flex items-center gap-1.5 text-muted-foreground text-xs"
            id={`${id}-hint`}
          >
            <Lock1 aria-hidden className="size-3.5 shrink-0" />
            QRdx checks the key with {name}, then stores it encrypted. It's
            never shown again.
          </p>
        )}
      </div>
    </form>
  );
}
