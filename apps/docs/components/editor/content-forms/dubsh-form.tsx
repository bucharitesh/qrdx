"use client";

import {
  Alert,
  AlertDescription,
} from "@repo/design-system/components/ui/alert";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { cn } from "@repo/design-system/lib/utils";
import * as React from "react";
import { toast } from "sonner";
import { Icons } from "@/components/icons";
import { apiFetch } from "@/lib/api-fetch";
import { useDubIntegration } from "@/lib/hooks/use-dub-integration";
import type { DubshFormData } from "@/lib/validations/qr-content";
import { dubshSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { DubshContent } from "@/types/qr-content";
import { encodeDubsh } from "@/utils/qr-content-encoder";

type DubFormMode = "create" | "select" | "manual";

interface CreateLinkFormData {
  url: string;
  domain: string;
  key: string;
  title: string;
  description: string;
}

const DEFAULT_CREATE_FORM: CreateLinkFormData = {
  url: "",
  domain: "",
  key: "",
  title: "",
  description: "",
};

function buildShortUrl(domain: string, key: string): string {
  return `https://${domain}/${key}`;
}

function getCreatePayload(formData: CreateLinkFormData) {
  return {
    url: formData.url.trim(),
    domain: formData.domain.trim() || undefined,
    key: formData.key.trim() || undefined,
    title: formData.title.trim() || undefined,
    description: formData.description.trim() || undefined,
  };
}

export function DubshForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();
  const { links, isLoading, isMutating, isConnected, error, createLink } =
    useDubIntegration();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("dubsh") as DubshContent | undefined;
  const [dubshData, setDubshData] = React.useState<DubshFormData>({
    shortUrl: storedConfig?.shortUrl || "",
    source: storedConfig?.source || "manual",
    dubLinkId: storedConfig?.dubLinkId,
    domain: storedConfig?.domain,
    key: storedConfig?.key,
    destinationUrl: storedConfig?.destinationUrl,
    qrCodeUrl: storedConfig?.qrCodeUrl,
  });
  const [createData, setCreateData] =
    React.useState<CreateLinkFormData>(DEFAULT_CREATE_FORM);
  const [mode, setMode] = React.useState<DubFormMode>(
    storedConfig?.source === "dub-created" ? "create" : "select",
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [open, setOpen] = React.useState(false);
  const [isConnecting, setIsConnecting] = React.useState(false);

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

  const handleConnect = async () => {
    setIsConnecting(true);

    try {
      const response = await apiFetch("/api/integrations/dub?action=connect");

      if (!response.ok) {
        throw new Error("Failed to start Dub connection");
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error("Dub did not return an authorization URL");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect Dub");
      setIsConnecting(false);
    }
  };

  const handleCreateLink = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const link = await createLink(getCreatePayload(createData));
      const shortUrl = buildShortUrl(link.domain, link.key);

      setDubshData({
        shortUrl,
        source: "dub-created",
        dubLinkId: link.id,
        domain: link.domain,
        key: link.key,
        destinationUrl: link.url,
        qrCodeUrl: link.qrCode,
      });
      toast.success("Dub link created");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create Dub link",
      );
    }
  };

  const selectedLink = links.find((link) => {
    const fullUrl = buildShortUrl(link.domain, link.key);
    return fullUrl === dubshData.shortUrl || link.id === dubshData.dubLinkId;
  });

  const manualForm = (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="dubsh-short-url">
          Dub.sh Short URL *
        </Label>
        <Input
          id="dubsh-short-url"
          type="url"
          placeholder="https://dub.sh/abc123"
          value={dubshData.shortUrl}
          onChange={(event) =>
            setDubshData({
              shortUrl: event.target.value,
              source: "manual",
            })
          }
          className={errors.shortUrl ? "border-destructive" : ""}
        />
        {errors.shortUrl ? (
          <p className="text-destructive text-[11px]">{errors.shortUrl}</p>
        ) : (
          <p className="text-muted-foreground text-[11px]">
            Enter a Dub short link manually.
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will redirect to your Dub short link.
      </p>
    </div>
  );

  if (!isConnected && mode !== "manual") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-white p-2">
              <img
                src="/integrations/dub-icon.svg"
                alt="Dub logo"
                className="size-full object-contain"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Connect Dub</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Connect Dub to create, select, and track Dub-powered QR codes.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleConnect}
                  disabled={isConnecting}
                >
                  {isConnecting && (
                    <Icons.Loader className="mr-1.5 size-3.5 animate-spin" />
                  )}
                  Connect Dub
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMode("manual")}
                >
                  Enter manually
                </Button>
              </div>
            </div>
          </div>
        </div>
        {manualForm}
      </div>
    );
  }

  if (!isConnected) {
    return manualForm;
  }

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <Icons.AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={mode}
        onValueChange={(value) => setMode(value as DubFormMode)}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="create">Create new</TabsTrigger>
          <TabsTrigger value="select">Select existing</TabsTrigger>
          <TabsTrigger value="manual">Manual URL</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="space-y-3">
          <form className="space-y-3" onSubmit={handleCreateLink}>
            <div className="space-y-2">
              <Label className="text-xs" htmlFor="dub-destination-url">
                Destination URL *
              </Label>
              <Input
                id="dub-destination-url"
                type="url"
                placeholder="https://example.com"
                value={createData.url}
                required
                onChange={(event) =>
                  setCreateData((current) => ({
                    ...current,
                    url: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label className="text-xs" htmlFor="dub-domain">
                  Domain
                </Label>
                <Input
                  id="dub-domain"
                  placeholder="dub.sh"
                  value={createData.domain}
                  onChange={(event) =>
                    setCreateData((current) => ({
                      ...current,
                      domain: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs" htmlFor="dub-key">
                  Slug
                </Label>
                <Input
                  id="dub-key"
                  placeholder="campaign"
                  value={createData.key}
                  onChange={(event) =>
                    setCreateData((current) => ({
                      ...current,
                      key: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs" htmlFor="dub-title">
                Title
              </Label>
              <Input
                id="dub-title"
                placeholder="Spring campaign"
                value={createData.title}
                onChange={(event) =>
                  setCreateData((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs" htmlFor="dub-description">
                Description
              </Label>
              <Input
                id="dub-description"
                placeholder="Optional internal note"
                value={createData.description}
                onChange={(event) =>
                  setCreateData((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={isMutating || !createData.url.trim()}
            >
              {isMutating && (
                <Icons.Loader className="mr-1.5 size-3.5 animate-spin" />
              )}
              Create Dub link
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="select" className="space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              <Label className="text-xs">Dub Short Link *</Label>
              <Skeleton className="h-10 w-full" />
              <p className="text-muted-foreground text-[11px]">
                Loading your Dub links...
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs">Dub Short Link *</Label>
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
                    <Icons.ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Search links..." />
                    <CommandList>
                      <CommandEmpty>No links found.</CommandEmpty>
                      <CommandGroup>
                        {links.map((link) => {
                          const fullUrl = buildShortUrl(link.domain, link.key);
                          const isSelected = dubshData.shortUrl === fullUrl;

                          return (
                            <CommandItem
                              key={link.id}
                              value={`${link.domain}/${link.key} ${link.url}`}
                              onSelect={() => {
                                setDubshData({
                                  shortUrl: fullUrl,
                                  source: "dub-selected",
                                  dubLinkId: link.id,
                                  domain: link.domain,
                                  key: link.key,
                                  destinationUrl: link.url,
                                  qrCodeUrl: link.qrCode,
                                });
                                setOpen(false);
                              }}
                              className="flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <Icons.Check
                                  className={cn(
                                    "size-4",
                                    isSelected ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span className="font-mono text-sm">
                                    {link.domain}/{link.key}
                                  </span>
                                  <span className="max-w-[300px] truncate text-muted-foreground text-xs">
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
                                <Icons.ExternalLink className="size-3 text-muted-foreground" />
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
                <p className="text-destructive text-[11px]">
                  {errors.shortUrl}
                </p>
              )}
              {!errors.shortUrl && selectedLink && (
                <p className="text-muted-foreground text-[11px]">
                  Points to: {selectedLink.url}
                </p>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="manual">{manualForm}</TabsContent>
      </Tabs>

      <p className="text-muted-foreground text-xs">
        Scanning will redirect to the selected Dub short link.
      </p>
    </div>
  );
}
