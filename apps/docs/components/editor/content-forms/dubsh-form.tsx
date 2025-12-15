"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/design-system/components/ui/command";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { cn } from "@repo/design-system/lib/utils";
import { Check, ChevronsUpDown, ExternalLink, Link2 } from "lucide-react";
import * as React from "react";
import { useDubIntegration } from "@/lib/hooks/use-dub-integration";
import type { DubshFormData } from "@/lib/validations/qr-content";
import { dubshSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { DubshContent } from "@/types/qr-content";
import { encodeDubsh } from "@/utils/qr-content-encoder";

export function DubshForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();
  const { links, isLoading, isConnected } = useDubIntegration();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("dubsh") as DubshContent | undefined;
  const [dubshData, setDubshData] = React.useState<DubshFormData>({
    shortUrl: storedConfig?.shortUrl || "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [open, setOpen] = React.useState(false);
  const [useManualInput, setUseManualInput] = React.useState(false);

  React.useEffect(() => {
    // Validate and encode
    const result = dubshSchema.safeParse(dubshData);

    if (result.success) {
      const config: DubshContent = { type: "dubsh", ...result.data };
      const encoded = encodeDubsh(config);
      setValue(encoded);
      setContentConfig("dubsh", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [dubshData, setValue, setContentConfig]);

  // Show manual input if not connected or user chose manual mode
  if (!isConnected || useManualInput) {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs" htmlFor="dubsh-short-url">
              Dub.sh Short URL *
            </Label>
            {isConnected && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setUseManualInput(false)}
                className="h-auto p-0 text-xs text-primary"
              >
                <Link2 className="mr-1 size-3" />
                Select from Dub
              </Button>
            )}
          </div>
          <Input
            id="dubsh-short-url"
            type="url"
            placeholder="https://dub.sh/abc123"
            value={dubshData.shortUrl}
            onChange={(e) => setDubshData({ shortUrl: e.target.value })}
            className={errors.shortUrl ? "border-destructive" : ""}
          />
          {errors.shortUrl && (
            <p className="text-destructive text-[11px]">{errors.shortUrl}</p>
          )}
          {!errors.shortUrl && (
            <p className="text-muted-foreground text-[11px]">
              {isConnected
                ? "Enter a Dub.sh short link manually"
                : "Connect your Dub account in Settings to select from existing links"}
            </p>
          )}
        </div>

        <p className="text-muted-foreground text-xs">
          Scanning will redirect to your Dub.sh short link
        </p>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs">Dub.sh Short Link *</Label>
          <Skeleton className="h-10 w-full" />
          <p className="text-muted-foreground text-[11px]">
            Loading your Dub links...
          </p>
        </div>
      </div>
    );
  }

  // Find selected link
  const selectedLink = links.find(
    (link) => `https://${link.domain}/${link.key}` === dubshData.shortUrl,
  );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Dub.sh Short Link *</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setUseManualInput(true)}
            className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
          >
            Enter manually
          </Button>
        </div>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn(
                "w-full justify-between",
                errors.shortUrl && "border-destructive",
              )}
            >
              {selectedLink ? (
                <span className="flex items-center gap-2 truncate">
                  <span className="font-mono text-xs">
                    {selectedLink.domain}/{selectedLink.key}
                  </span>
                  {selectedLink.clicks !== undefined && (
                    <span className="text-muted-foreground text-xs">
                      ({selectedLink.clicks} clicks)
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Select a short link...
                </span>
              )}
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0">
            <Command>
              <CommandInput placeholder="Search links..." />
              <CommandList>
                <CommandEmpty>No links found.</CommandEmpty>
                <CommandGroup>
                  {links.map((link) => {
                    const fullUrl = `https://${link.domain}/${link.key}`;
                    const isSelected = dubshData.shortUrl === fullUrl;

                    return (
                      <CommandItem
                        key={link.id}
                        value={`${link.domain}/${link.key}`}
                        onSelect={() => {
                          setDubshData({ shortUrl: fullUrl });
                          setOpen(false);
                        }}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Check
                            className={cn(
                              "size-4",
                              isSelected ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <div className="flex flex-col">
                            <span className="font-mono text-sm">
                              {link.domain}/{link.key}
                            </span>
                            <span className="text-muted-foreground text-xs truncate max-w-[300px]">
                              {link.url}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {link.clicks !== undefined && (
                            <span className="text-muted-foreground text-xs">
                              {link.clicks}
                            </span>
                          )}
                          <ExternalLink className="size-3 text-muted-foreground" />
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {errors.shortUrl && (
          <p className="text-destructive text-[11px]">{errors.shortUrl}</p>
        )}
        {!errors.shortUrl && selectedLink && (
          <p className="text-muted-foreground text-[11px]">
            Points to: {selectedLink.url}
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will redirect to your selected short link
      </p>
    </div>
  );
}
