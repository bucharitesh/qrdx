"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { cn } from "@repo/design-system/lib/utils";
import { Add, ArrowDown2 } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  CloudPickerDialog,
  type PickedLink,
} from "@/components/connected-accounts/cloud-picker-dialog";
import { ShortLinkDialog } from "@/components/connected-accounts/short-link-dialog";
import { useConnections } from "@/components/connected-accounts/use-connections";
import { SourcePickerDialog } from "@/components/data-connections/source-picker";
import { emitSound } from "@/components/editor/sound";
import { IntegrationLogo } from "@/components/sections/integrations/integration-logo";
import type { ConnectedProvider } from "@/lib/connected-accounts/client";
import {
  isIntegrationsMock,
  loadSources,
  type SourceStatusView,
} from "@/lib/data-connections/client";
import { useIntegrationAvailability } from "@/lib/hooks/use-integration-availability";
import { useQREditorStore } from "@/store/editor-store";
import type { UrlContent } from "@/types/qr-content";
import {
  buildLinkSourceMenu,
  connectableSummary,
  KIND_HINTS,
  type LinkSourceOption,
  SOURCE_HINTS,
} from "./link-sources";

type OpenDialog =
  | { kind: "short-links" | "files"; provider: ConnectedProvider }
  | { kind: "source"; source: SourceStatusView };

/** The URL type's account sources (Stripe, Shopify, Calendly); signed in only. */
function useUrlSources(signedIn: boolean): SourceStatusView[] | null {
  const [sources, setSources] = useState<SourceStatusView[] | null>(null);
  useEffect(() => {
    if (!signedIn) {
      setSources(null);
      return;
    }
    let active = true;
    loadSources("url")
      .then((result) => active && setSources(result.sources))
      .catch(() => active && setSources([]));
    return () => {
      active = false;
    };
  }, [signedIn]);
  return sources;
}

/**
 * "Use a link from…": one quiet menu beside the website field that fills it
 * from a connected account (shorten with Bitly, a Dropbox file, a Stripe
 * payment link…), then offers to connect the rest in Settings. Shown only
 * when signed in and when this deployment offers at least one provider; it
 * sits in the label row, so appearing late never moves the form.
 */
export function LinkSourceMenu({ className }: { className?: string }) {
  const t = useTranslations("editor.linkSourceMenu");
  const { data: session } = authClient.useSession();
  const signedIn = Boolean(session?.user) || isIntegrationsMock();
  const connections = useConnections();
  const sources = useUrlSources(signedIn);
  const availability = useIntegrationAvailability();
  const url = useQREditorStore(
    (state) => (state.contentConfigs.url as UrlContent | undefined)?.url ?? "",
  );
  const setContentConfig = useQREditorStore((state) => state.setContentConfig);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);

  const menu = useMemo(
    () =>
      signedIn ? buildLinkSourceMenu(connections, sources, availability) : null,
    [signedIn, connections, sources, availability],
  );

  if (!menu) return null;

  /** `chime`: false when the picker dialog already played its sound. */
  const apply = (
    next: string,
    text: string,
    { warning, chime = true }: { warning?: string; chime?: boolean } = {},
  ) => {
    const previous = url;
    setContentConfig("url", { type: "url", url: next });
    if (chime) emitSound("success");
    const undo = {
      label: t("undo"),
      onClick: () => setContentConfig("url", { type: "url", url: previous }),
    };
    if (warning) toast.warning(text, { description: warning, action: undo });
    else toast.success(text, { action: undo });
  };

  const open = (option: LinkSourceOption) => {
    if (option.kind === "source") {
      const source = sources?.find((item) => item.slug === option.slug);
      if (source) setDialog({ kind: "source", source });
      return;
    }
    const provider = connections?.find((item) => item.slug === option.slug);
    if (provider) setDialog({ kind: option.kind, provider });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className={cn(
              "text-muted-foreground hover:text-foreground data-[state=open]:text-foreground -mr-2 h-7 gap-1 px-2 text-xs",
              className,
            )}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("useALinkFrom")}
            <ArrowDown2 aria-hidden className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {menu.ready.length > 0 && (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                {t("yourAccounts")}
              </DropdownMenuLabel>
              {menu.ready.map((option) => (
                <DropdownMenuItem
                  key={`${option.kind}:${option.slug}`}
                  onSelect={() => open(option)}
                >
                  <IntegrationLogo
                    className="size-5 p-0.5"
                    logo={{ type: "image", src: option.logo }}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {option.kind === "source"
                      ? (SOURCE_HINTS[option.slug] ?? "")
                      : KIND_HINTS[option.kind]}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}
          {menu.ready.length > 0 && menu.connectable.length > 0 && (
            <DropdownMenuSeparator />
          )}
          {menu.connectable.length > 0 && (
            <DropdownMenuItem asChild>
              <Link className="items-start" href="/settings/integrations">
                <Add aria-hidden className="mt-0.5 size-4" />
                <span className="min-w-0 flex-1">
                  <span className="block">{t("connectAnAccount")}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {connectableSummary(menu.connectable)}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog?.kind === "short-links" && (
        <ShortLinkDialog
          initialUrl={url}
          onDone={(link, how) =>
            apply(
              link.shortUrl,
              `${how === "created" ? "Created" : "Using"} ${link.shortUrl.replace(/^https?:\/\//, "")} in ${dialog.provider.name}`,
            )
          }
          onOpenChange={(next) => !next && setDialog(null)}
          open
          provider={dialog.provider}
        />
      )}
      {dialog?.kind === "files" && (
        <CloudPickerDialog
          onOpenChange={(next) => !next && setDialog(null)}
          onPicked={(result: PickedLink) =>
            apply(
              result.url,
              `Scans open “${result.name ?? result.item.name}” from ${dialog.provider.name}`,
              { warning: result.warning },
            )
          }
          open
          provider={dialog.provider}
        />
      )}
      {dialog?.kind === "source" && (
        <SourcePickerDialog
          onOpenChange={(next) => !next && setDialog(null)}
          onPick={(item) =>
            apply(
              item.url,
              `Using “${item.title}” from ${dialog.source.name}`,
              {
                chime: false,
              },
            )
          }
          open
          source={dialog.source}
        />
      )}
    </>
  );
}
