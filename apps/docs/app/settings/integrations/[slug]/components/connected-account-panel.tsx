"use client";

import { toast } from "@repo/design-system";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import type { ShortLink } from "@repo/integrations";
import { Copy, DocumentCloud, ExportSquare, Warning2 } from "iconsax-reactjs";
import { useEffect, useId, useState } from "react";
import {
  CloudPickerDialog,
  type PickedLink,
} from "@/components/connected-accounts/cloud-picker-dialog";
import { emitSound } from "@/components/editor/sound";
import {
  type DomainsResponse,
  listShortLinks,
  loadShortLinkDomains,
} from "@/lib/connected-accounts/client";
import { setDefaultShortLinkDomainAction } from "../../connected-account-actions";

interface ConnectedAccountPanelProps {
  slug: string;
  name: string;
  logo: string;
  kind: "short-links" | "files";
  metadata?: Record<string, unknown>;
}

function readText(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value ? value : null;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-xl border bg-card p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground text-pretty">
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function AccountLine({ metadata }: { metadata?: Record<string, unknown> }) {
  const name = readText(metadata, "name") ?? readText(metadata, "login");
  const email = readText(metadata, "email");
  if (!(name || email)) return null;
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">Account: </span>
      <span className="font-medium">{name ?? email}</span>
      {name && email && (
        <span className="text-muted-foreground"> · {email}</span>
      )}
    </p>
  );
}

function ShortLinkSettings({
  slug,
  name,
  metadata,
}: Omit<ConnectedAccountPanelProps, "kind" | "logo">) {
  const selectId = useId();
  const [domains, setDomains] = useState<DomainsResponse | null>(null);
  const [links, setLinks] = useState<ShortLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [domainId, setDomainId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadShortLinkDomains(slug)
      .then((result) => {
        setDomains(result);
        setDomainId(result.defaultDomainId ?? "");
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Couldn't load domains"),
      );
    listShortLinks(slug)
      .then((page) => setLinks(page.links.slice(0, 5)))
      .catch(() => setLinks([]));
  }, [slug]);

  const saveDomain = async (next: string) => {
    const previous = domainId;
    setDomainId(next);
    setSaving(true);
    const result = await setDefaultShortLinkDomainAction(slug, next).catch(
      () => ({ ok: false as const, error: "Couldn't save the domain." }),
    );
    setSaving(false);
    if (result.ok) {
      toast.success("Default domain saved");
    } else {
      setDomainId(previous);
      toast.error(result.error);
    }
  };

  return (
    <Section
      description={`New links from the QR editor are created in your ${name} account on this domain. You can still pick another one per link.`}
      title={`Your ${name} account`}
    >
      <AccountLine metadata={metadata} />
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="space-y-2">
        <label className="font-medium text-sm" htmlFor={selectId}>
          Default domain
        </label>
        {domains === null && !error ? (
          <Skeleton className="h-9 w-full max-w-sm rounded-full" />
        ) : domains && domains.domains.length > 0 ? (
          <Select disabled={saving} onValueChange={saveDomain} value={domainId}>
            <SelectTrigger className="w-full max-w-sm" id={selectId}>
              <SelectValue placeholder="Pick a domain" />
            </SelectTrigger>
            <SelectContent>
              {domains.domains.map((domain) => (
                <SelectItem key={domain.id} value={domain.id}>
                  {domain.hostname}
                  {domain.branded ? "" : ` (${name} default)`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-muted-foreground text-sm">
            No domains yet. Add one in {name}, then reload this page.
          </p>
        )}
      </div>
      {domains?.groups && domains.groups.length > 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">
            {domains.groups.length === 1 ? "Group: " : "Groups: "}
          </span>
          {domains.groups.map((group) => group.name).join(", ")}
          {domains.groups.length > 1 && (
            <span className="text-muted-foreground">
              {" "}
              (links go to your default group)
            </span>
          )}
        </p>
      )}
      <div className="space-y-2">
        <p className="font-medium text-sm">Recent links</p>
        {links === null ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : links.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No links yet. Create one from the QR editor: choose Website, then
            Shorten.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {links.map((link) => (
              <li className="min-w-0 px-3 py-2" key={link.id}>
                <p className="truncate font-mono text-sm">
                  {link.shortUrl.replace(/^https?:\/\//, "")}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {link.longUrl}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

function FilePickerSettings({
  slug,
  name,
  logo,
  metadata,
}: Omit<ConnectedAccountPanelProps, "kind">) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<PickedLink | null>(null);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      emitSound("copy");
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  };

  return (
    <Section
      description={
        slug === "notion"
          ? "In the QR editor, choose Website, then Pick a file → Notion. Only pages you shared with QRdx appear: add more in Notion from a page's ••• → Connections, or reconnect and pick them."
          : `In the QR editor, choose Website, then Pick a file → ${name}. Page blocks with a file (PDF, audio, video, downloads) also get From ${name}.`
      }
      title={`Your ${name} account`}
    >
      <AccountLine metadata={metadata} />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setOpen(true)} size="sm" variant="outline">
          <DocumentCloud aria-hidden className="size-4" />
          Try the picker
        </Button>
      </div>
      {picked && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate font-mono text-xs">
              {picked.url}
            </p>
            <Badge variant="outline">
              {picked.access === "public"
                ? "Anyone with the link"
                : picked.access === "organization"
                  ? "Your organization"
                  : "Restricted"}
            </Badge>
            <Button
              aria-label="Copy link"
              onClick={() => copy(picked.url)}
              size="icon-sm"
              variant="ghost"
            >
              <Copy aria-hidden className="size-4" />
            </Button>
            <Button
              aria-label="Open link"
              asChild
              size="icon-sm"
              variant="ghost"
            >
              <a href={picked.url} rel="noopener noreferrer" target="_blank">
                <ExportSquare aria-hidden className="size-4" />
              </a>
            </Button>
          </div>
          {picked.warning && (
            <p className="flex items-start gap-1.5 text-amber-700 text-xs dark:text-amber-400">
              <Warning2 aria-hidden className="mt-px size-3.5 shrink-0" />
              {picked.warning}
            </p>
          )}
        </div>
      )}
      <CloudPickerDialog
        onOpenChange={setOpen}
        onPicked={setPicked}
        open={open}
        provider={{ slug, name, logo }}
      />
    </Section>
  );
}

/** Account details and a working example, shown once connected. */
export function ConnectedAccountPanel(props: ConnectedAccountPanelProps) {
  return props.kind === "short-links" ? (
    <ShortLinkSettings
      metadata={props.metadata}
      name={props.name}
      slug={props.slug}
    />
  ) : (
    <FilePickerSettings {...props} />
  );
}
