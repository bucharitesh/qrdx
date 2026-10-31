"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { DocumentCloud } from "iconsax-reactjs";
import { useState } from "react";
import { IntegrationLogo } from "@/components/sections/integrations/integration-logo";
import type { ConnectedProvider } from "@/lib/connected-accounts/client";
import { CloudPickerDialog, type PickedLink } from "./cloud-picker-dialog";
import { useConnections } from "./use-connections";

interface CloudFileButtonProps {
  /** Gets a direct file link when the provider has one, else its share link. */
  onPick: (url: string, name: string) => void;
}

/**
 * "From Dropbox / OneDrive / Box" for page blocks that take a file (PDF,
 * audio, video, downloads). Renders nothing until a storage account is
 * connected, so file blocks stay unchanged for everyone else.
 */
export function CloudFileButton({ onPick }: CloudFileButtonProps) {
  const providers = useConnections();
  const [provider, setProvider] = useState<ConnectedProvider | null>(null);

  const storage = (providers ?? []).filter(
    (item) =>
      item.capability === "files" &&
      item.slug !== "notion" &&
      item.connected &&
      item.status === "active",
  );
  if (storage.length === 0) return null;

  const picked = (result: PickedLink) => {
    onPick(result.directUrl ?? result.url, result.item.name);
    if (result.warning) {
      toast.warning(result.warning);
    } else if (!result.directUrl) {
      toast.info(
        `${provider?.name ?? "This"} link opens a viewer page, so players and inline previews may show it as a link.`,
      );
    }
  };

  const [only] = storage;
  return (
    <>
      {storage.length === 1 && only ? (
        <Button
          onClick={() => setProvider(only)}
          size="sm"
          type="button"
          variant="outline"
        >
          <DocumentCloud aria-hidden className="size-4" />
          From {only.name}
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" type="button" variant="outline">
              <DocumentCloud aria-hidden className="size-4" />
              From cloud storage
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {storage.map((item) => (
              <DropdownMenuItem
                key={item.slug}
                onSelect={() => setProvider(item)}
              >
                <IntegrationLogo
                  className="size-5 p-0.5"
                  logo={{ type: "image", src: item.logo }}
                  size="sm"
                />
                {item.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {provider && (
        <CloudPickerDialog
          onOpenChange={(open) => !open && setProvider(null)}
          onPicked={picked}
          open
          provider={provider}
          purpose="file"
        />
      )}
    </>
  );
}
