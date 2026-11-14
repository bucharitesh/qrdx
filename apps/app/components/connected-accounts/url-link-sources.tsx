"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { DocumentCloud, Scissor, Warning2 } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { emitSound } from "@/components/editor/sound";
import { IntegrationLogo } from "@/components/sections/integrations/integration-logo";
import { linkSourcesHint } from "@/lib/availability-copy";
import type { ConnectedProvider } from "@/lib/connected-accounts/client";
import { useQREditorStore } from "@/store/editor-store";
import type { UrlContent } from "@/types/qr-content";
import { CloudPickerDialog, type PickedLink } from "./cloud-picker-dialog";
import { ShortLinkDialog } from "./short-link-dialog";
import { useConnections } from "./use-connections";

type OpenDialog =
  | { kind: "short-links"; provider: ConnectedProvider }
  | { kind: "files"; provider: ConnectedProvider };

interface Note {
  text: string;
  warning?: string;
  previous: string;
}

const linkClass =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground";

function ProviderMenu({
  label,
  icon,
  providers,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
  providers: ConnectedProvider[];
  onSelect: (provider: ConnectedProvider) => void;
}) {
  const t = useTranslations("editor.connections.urlLinkSources");
  if (providers.length === 1) {
    const [only] = providers as [ConnectedProvider];
    return (
      <Button
        onClick={() => onSelect(only)}
        size="sm"
        type="button"
        variant="outline"
      >
        {icon}
        {t("labelWithName", { label, name: only.name })}
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          {icon}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          {t("yourAccounts")}
        </DropdownMenuLabel>
        {providers.map((provider) => (
          <DropdownMenuItem
            key={provider.slug}
            onSelect={() => onSelect(provider)}
          >
            <IntegrationLogo
              className="size-5 p-0.5"
              logo={{ type: "image", src: provider.logo }}
              size="sm"
            />
            {provider.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Under the website field: shorten the address with a connected Bitly,
 * Rebrandly or Short.io account, or replace it with the share link of a
 * Dropbox, OneDrive, Box or Notion item. Only providers this deployment can
 * connect are named (production leaves out the ones that need setup), and
 * nothing shows when there are none. Hidden when signed out.
 */
export function UrlLinkSources() {
  const t = useTranslations("editor.connections.urlLinkSources");
  const providers = useConnections();
  const url = useQREditorStore(
    (state) => (state.contentConfigs.url as UrlContent | undefined)?.url ?? "",
  );
  const setContentConfig = useQREditorStore((state) => state.setContentConfig);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [note, setNote] = useState<Note | null>(null);

  if (!providers) return null;

  const ready = providers.filter(
    (provider) => provider.connected && provider.status === "active",
  );
  const shorteners = ready.filter((p) => p.capability === "short-links");
  const pickers = ready.filter((p) => p.capability === "files");

  const applyUrl = (next: string, text: string, warning?: string) => {
    setNote({ text, warning, previous: url });
    setContentConfig("url", { type: "url", url: next });
    emitSound("success");
  };

  if (shorteners.length === 0 && pickers.length === 0) {
    const hint = linkSourcesHint(
      providers.filter((provider) => provider.configured),
    );
    if (!hint) return null;
    return (
      <p className="text-muted-foreground text-xs text-pretty">
        {hint}:{" "}
        <Link className={linkClass} href="/settings/integrations">
          {t("connectAnAccount")}
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {shorteners.length > 0 && (
          <ProviderMenu
            icon={<Scissor aria-hidden className="size-4" />}
            label={t("shorten")}
            onSelect={(provider) =>
              setDialog({ kind: "short-links", provider })
            }
            providers={shorteners}
          />
        )}
        {pickers.length > 0 && (
          <ProviderMenu
            icon={<DocumentCloud aria-hidden className="size-4" />}
            label={t("pickAFile")}
            onSelect={(provider) => setDialog({ kind: "files", provider })}
            providers={pickers}
          />
        )}
      </div>

      {note && (
        <div aria-live="polite" className="space-y-1 text-xs">
          <p className="text-muted-foreground">
            {note.text}{" "}
            <button
              className={linkClass}
              onClick={() => {
                setContentConfig("url", { type: "url", url: note.previous });
                setNote(null);
              }}
              type="button"
            >
              {t("undo")}
            </button>
          </p>
          {note.warning && (
            <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
              <Warning2 aria-hidden className="mt-px size-3.5 shrink-0" />
              {note.warning}
            </p>
          )}
        </div>
      )}

      {dialog?.kind === "short-links" && (
        <ShortLinkDialog
          initialUrl={url}
          onDone={(link, how) =>
            applyUrl(
              link.shortUrl,
              `${how === "created" ? "Created" : "Using"} ${link.shortUrl.replace(/^https?:\/\//, "")} in ${dialog.provider.name}, which opens ${link.longUrl}.`,
            )
          }
          onOpenChange={(open) => !open && setDialog(null)}
          open
          provider={dialog.provider}
        />
      )}
      {dialog?.kind === "files" && (
        <CloudPickerDialog
          onOpenChange={(open) => !open && setDialog(null)}
          onPicked={(result: PickedLink) =>
            applyUrl(
              result.url,
              `Scans open “${result.name ?? result.item.name}” from ${dialog.provider.name}.`,
              result.warning,
            )
          }
          open
          provider={dialog.provider}
        />
      )}
    </div>
  );
}
