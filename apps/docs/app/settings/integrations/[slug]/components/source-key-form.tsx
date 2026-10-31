"use client";

import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import type { IntegrationApiKeyConfig } from "@repo/integrations";
import { ExportSquare, Lock1 } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { emitSound } from "@/components/editor/sound";
import { connectDataSourceAction } from "../../data-connection-actions";

const linkClass =
  "inline-flex items-center gap-1 font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground";

/** Key settings to pick in the provider, shown above the form. */
const KEY_STEPS: Record<string, string[]> = {
  stripe: [
    "Stripe Dashboard → Developers → API keys → Create restricted key.",
    "Name it “QRdx”. Set Payment Links to Read; leave everything else at None.",
    "Create the key and paste it here (rk_live_… or rk_test_…).",
  ],
  calcom: [
    "Cal.com → Settings → Developer → API keys → Add.",
    "Name it “QRdx” and pick an expiry (or none). Copy the key; it's shown once.",
  ],
  shopify: [
    "Shopify admin → Settings → Apps → Develop apps → Build apps in Dev Dashboard → Create app.",
    "Create a version with the read_products scope, release it, then install it on this store.",
    "Paste the store domain and the app's client ID and secret (Dev Dashboard → your app → Settings).",
  ],
};

interface SourceKeyFormProps {
  slug: "stripe" | "calcom" | "shopify";
  name: string;
  apiKey?: IntegrationApiKeyConfig;
  reconnect?: boolean;
}

/** Paste-a-key connection for content sources, checked then stored encrypted. */
export function SourceKeyForm({
  slug,
  name,
  apiKey,
  reconnect = false,
}: SourceKeyFormProps) {
  const router = useRouter();
  const id = useId();
  const [key, setKey] = useState("");
  const [shop, setShop] = useState("");
  const [mode, setMode] = useState<"client" | "token">("client");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    slug === "shopify"
      ? shop.trim().length > 2 &&
        (mode === "token"
          ? key.trim().length >= 8
          : clientId.trim() && clientSecret.trim())
      : key.trim().length >= 8;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await connectDataSourceAction(
        slug === "shopify"
          ? {
              provider: slug,
              shop,
              ...(mode === "token"
                ? { accessToken: key }
                : { clientId, clientSecret }),
            }
          : { provider: slug, apiKey: key },
      );
      if (result.ok) {
        setKey("");
        setClientSecret("");
        emitSound("success");
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
    <form className="space-y-5 rounded-xl border bg-card p-6" onSubmit={submit}>
      <div className="space-y-2">
        <h2 className="text-base font-semibold">
          {reconnect ? `Reconnect ${name}` : `Connect ${name}`}
        </h2>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground text-sm text-pretty">
          {KEY_STEPS[slug]?.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {apiKey?.helpUrl && (
          <a
            className={linkClass}
            href={apiKey.helpUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open {name}
            <ExportSquare aria-hidden className="size-3.5" />
          </a>
        )}
      </div>

      {slug === "shopify" && (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${id}-shop`}>Store domain</Label>
            <Input
              autoComplete="off"
              id={`${id}-shop`}
              onChange={(event) => setShop(event.target.value)}
              placeholder="your-store.myshopify.com"
              spellCheck={false}
              value={shop}
            />
          </div>
          <ToggleGroup
            aria-label="How the app connects"
            className="justify-start"
            onValueChange={(value) =>
              value && setMode(value as "client" | "token")
            }
            type="single"
            value={mode}
            variant="outline"
          >
            <ToggleGroupItem value="client">
              Client ID and secret
            </ToggleGroupItem>
            <ToggleGroupItem value="token">
              Admin API access token
            </ToggleGroupItem>
          </ToggleGroup>
        </>
      )}

      {slug === "shopify" && mode === "client" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${id}-client`}>Client ID</Label>
            <Input
              autoComplete="off"
              className="font-mono"
              id={`${id}-client`}
              onChange={(event) => setClientId(event.target.value)}
              spellCheck={false}
              value={clientId}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-secret`}>Client secret</Label>
            <Input
              autoComplete="off"
              className="font-mono"
              id={`${id}-secret`}
              onChange={(event) => setClientSecret(event.target.value)}
              spellCheck={false}
              type="password"
              value={clientSecret}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor={`${id}-key`}>
            {slug === "shopify"
              ? "Admin API access token"
              : (apiKey?.label ?? "API key")}
          </Label>
          <Input
            autoComplete="off"
            className="font-mono"
            id={`${id}-key`}
            onChange={(event) => setKey(event.target.value)}
            placeholder={slug === "shopify" ? "shpat_…" : apiKey?.placeholder}
            spellCheck={false}
            type="password"
            value={key}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {error ? (
          <p className="text-destructive text-xs text-pretty" role="alert">
            {error}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-muted-foreground text-xs text-pretty">
            <Lock1 aria-hidden className="size-3.5 shrink-0" />
            Checked with one read call, then stored encrypted. Never shown
            again.
          </p>
        )}
        <Button disabled={pending || !ready} type="submit">
          {pending && <Spinner className="size-4" />}
          {reconnect ? "Save" : "Connect"}
        </Button>
      </div>
    </form>
  );
}
