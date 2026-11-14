"use client";

import { Spinner } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown2, DocumentDownload } from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { LoadMore } from "@/components/load-more";
import { loadMoreAuditEvents } from "@/ee/audit-log/actions";
import {
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_LABELS,
  auditFieldLabel,
} from "@/ee/audit-log/catalogue";
import {
  type AuditFilter,
  auditFilterQuery,
  isFiltered,
} from "@/ee/audit-log/filter";
import type {
  AuditActorOption,
  AuditEventView,
  AuditPage,
} from "@/ee/audit-log/queries";
import { useCursorList } from "@/lib/hooks/use-cursor-list";
import { useMounted } from "@/lib/hooks/use-mounted";

const ALL = "all";

/** Until the page has mounted, times show in UTC (the server's rendering). */
function useTimeFormat() {
  const mounted = useMounted();
  return (iso: string, style: "short" | "long" = "short") =>
    new Intl.DateTimeFormat(mounted ? undefined : "en-US", {
      dateStyle: "medium",
      timeStyle: style === "long" ? "long" : "short",
      ...(mounted ? {} : { timeZone: "UTC" }),
    }).format(new Date(iso)) + (mounted || style === "long" ? "" : " UTC");
}

const filterQuery = (filter: AuditFilter) => {
  const query = auditFilterQuery(filter);
  return query ? `?${query}` : "";
};

const filterRecord = (filter: AuditFilter) =>
  Object.fromEntries(
    Object.entries(filter).filter(([, value]) => Boolean(value)),
  ) as Record<string, string>;

/** "Ana Diaz <ana@acme.com>" → name and email. */
function splitPerson(label: string | null): { name: string; email: string } {
  const match = label ? /^(.*) <([^>]+)>$/.exec(label) : null;
  if (match) return { name: match[1] as string, email: match[2] as string };
  return { name: label ?? "Someone", email: "" };
}

function Actor({ actor }: { actor: AuditEventView["actor"] }) {
  if (actor.type === "user") {
    const { name, email } = splitPerson(actor.label);
    return (
      <span className="min-w-0">
        <span className="font-medium">{name}</span>
        {email && (
          <span className="text-muted-foreground block truncate text-xs">
            {email}
          </span>
        )}
      </span>
    );
  }
  if (actor.type === "system") {
    return <span className="font-medium">{actor.label ?? "QRdx"}</span>;
  }
  if (actor.type === "slack") {
    // A /qr track: the linked person, via the Slack account (by id).
    return (
      <span className="min-w-0">
        <span className="font-medium">{splitPerson(actor.person).name}</span>
        <span className="text-muted-foreground block truncate text-xs">
          via Slack{actor.label ? ` (${actor.label})` : ""}
        </span>
      </span>
    );
  }
  const kind = actor.type === "api_key" ? "API key" : "App";
  return (
    <span className="min-w-0">
      <span className="font-medium">
        {kind} {actor.label ? `“${actor.label}”` : ""}
      </span>
      {actor.person && (
        <span className="text-muted-foreground block truncate text-xs">
          for {actor.person}
        </span>
      )}
    </span>
  );
}

function Sentence({ event }: { event: AuditEventView }) {
  return (
    <span className="break-words">
      {event.sentence.map((part, index) => {
        if ("text" in part) {
          return <span key={index}>{part.text}</span>;
        }
        return event.target.href ? (
          <Link
            className="font-medium underline underline-offset-2"
            href={event.target.href}
            key={index}
          >
            {part.target}
          </Link>
        ) : (
          <span className="font-medium" key={index}>
            {part.target}
          </span>
        );
      })}
    </span>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function Changes({ metadata }: { metadata: Record<string, unknown> }) {
  const before = (metadata.before ?? {}) as Record<string, unknown>;
  const after = (metadata.after ?? {}) as Record<string, unknown>;
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const extras = Object.entries(metadata).filter(
    ([key]) => key !== "before" && key !== "after",
  );
  if (fields.length === 0 && extras.length === 0) return null;
  return (
    <div className="space-y-2">
      {fields.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-1.5 font-medium">Field</th>
                <th className="px-3 py-1.5 font-medium">Before</th>
                <th className="px-3 py-1.5 font-medium">After</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr className="border-t align-top" key={field}>
                  <td className="text-muted-foreground px-3 py-1.5 whitespace-nowrap">
                    {auditFieldLabel(field)}
                  </td>
                  <td className="px-3 py-1.5 break-all">
                    {formatValue(before[field])}
                  </td>
                  <td className="px-3 py-1.5 break-all">
                    {formatValue(after[field])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {extras.map(([key, value]) => (
        <Detail key={key} label={auditFieldLabel(key)}>
          {formatValue(value)}
        </Detail>
      ))}
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 text-xs sm:grid-cols-[8rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all">{children}</dd>
    </div>
  );
}

function EventRow({
  event,
  format,
}: {
  event: AuditEventView;
  format: ReturnType<typeof useTimeFormat>;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  return (
    <li className="px-4 py-3" data-audit-action={event.action}>
      <div className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-1 text-sm sm:grid-cols-[9.5rem_minmax(0,12rem)_minmax(0,1fr)] sm:gap-4">
          <time
            className="text-muted-foreground text-xs sm:pt-0.5"
            dateTime={event.createdAt}
          >
            {format(event.createdAt)}
          </time>
          <Actor actor={event.actor} />
          <span className="min-w-0">
            <Sentence event={event} />
            {event.category && (
              <Badge className="ml-2 align-middle" variant="outline">
                {AUDIT_CATEGORY_LABELS[event.category]}
              </Badge>
            )}
          </span>
        </div>
        <Button
          aria-controls={detailsId}
          aria-expanded={open}
          aria-label={open ? "Hide details" : "Show details"}
          className="-my-1 shrink-0"
          onClick={() => setOpen((value) => !value)}
          size="icon-sm"
          variant="ghost"
        >
          <ArrowDown2
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </Button>
      </div>
      {open && (
        <dl
          className="bg-muted/30 mt-3 space-y-2 rounded-md p-3"
          id={detailsId}
        >
          <Detail label="Time">{format(event.createdAt, "long")}</Detail>
          <Detail label="IP address">{event.ip ?? "Not recorded"}</Detail>
          <Detail label="Device">{event.device ?? "Not recorded"}</Detail>
          <Detail label="Action">
            <code className="font-mono">{event.action}</code>
          </Detail>
          {event.target.id && (
            <Detail label="Target ID">
              <code className="font-mono">{event.target.id}</code>
            </Detail>
          )}
          {event.metadata && <Changes metadata={event.metadata} />}
        </dl>
      )}
    </li>
  );
}

export function AuditLogView({
  actors,
  basePath,
  exportHref,
  exportLimit,
  filter,
  initial,
  retentionDays,
}: {
  actors: AuditActorOption[];
  basePath: string;
  exportHref: string;
  exportLimit: number;
  filter: AuditFilter;
  initial: AuditPage;
  retentionDays: number;
}) {
  const router = useRouter();
  const format = useTimeFormat();
  const [navigating, startNavigating] = useTransition();
  const ids = { who: useId(), category: useId(), from: useId(), to: useId() };
  // Newest first; more load as the list nears the bottom. Another filter
  // starts over from its first page.
  const list = useCursorList({
    first: { items: initial.events, nextCursor: initial.nextCursor },
    resetKey: filterQuery(filter),
    keyOf: (event) => event.id,
    errorMessage: "Couldn't load more events. Try again.",
    load: async (cursor) => {
      const result = await loadMoreAuditEvents({
        filter: filterRecord(filter),
        cursor,
      });
      if (!result.ok) throw new Error(result.error);
      return { items: result.data.events, nextCursor: result.data.nextCursor };
    },
  });
  const events = list.items;

  const apply = (patch: Partial<AuditFilter>) => {
    const next = { ...filter, ...patch };
    startNavigating(() => router.push(`${basePath}${filterQuery(next)}`));
  };

  const filtered = isFiltered(filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid w-full gap-1.5 sm:w-52">
          <Label htmlFor={ids.who}>Who</Label>
          <Select
            onValueChange={(value) =>
              apply({ actor: value === ALL ? null : value })
            }
            value={filter.actor ?? ALL}
          >
            <SelectTrigger className="w-full" id={ids.who}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everyone</SelectItem>
              {actors.map((actor) => (
                <SelectItem key={actor.id} value={actor.id}>
                  {actor.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid w-full gap-1.5 sm:w-40">
          <Label htmlFor={ids.category}>Category</Label>
          <Select
            onValueChange={(value) =>
              apply({
                category:
                  value === ALL ? null : (value as AuditFilter["category"]),
              })
            }
            value={filter.category ?? ALL}
          >
            <SelectTrigger className="w-full" id={ids.category}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {AUDIT_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {AUDIT_CATEGORY_LABELS[category]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 flex-[1_1_calc(50%-0.375rem)] gap-1.5 sm:w-40 sm:flex-none">
          <Label htmlFor={ids.from}>From (UTC)</Label>
          <Input
            id={ids.from}
            max={filter.to ?? undefined}
            onChange={(event) => apply({ from: event.target.value || null })}
            type="date"
            value={filter.from ?? ""}
          />
        </div>
        <div className="grid min-w-0 flex-[1_1_calc(50%-0.375rem)] gap-1.5 sm:w-40 sm:flex-none">
          <Label htmlFor={ids.to}>To (UTC)</Label>
          <Input
            id={ids.to}
            min={filter.from ?? undefined}
            onChange={(event) => apply({ to: event.target.value || null })}
            type="date"
            value={filter.to ?? ""}
          />
        </div>
        {filtered && (
          <Button
            className="max-sm:h-10"
            onClick={() =>
              apply({ actor: null, category: null, from: null, to: null })
            }
            variant="ghost"
          >
            Clear filters
          </Button>
        )}
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          {navigating && <Spinner className="size-4" />}
          <Button
            asChild
            className="max-sm:h-10 max-sm:flex-1"
            variant="outline"
          >
            <a download href={exportHref}>
              <DocumentDownload className="size-4" />
              Export CSV
            </a>
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Kept for {retentionDays} days. Export CSV saves what the filters show,
        up to {exportLimit.toLocaleString("en-US")} events; for more, export a
        shorter date range at a time.
      </p>

      {events.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {filtered
            ? "Nothing matches these filters."
            : "Nothing recorded yet. Changes people make in this workspace show up here."}
        </p>
      ) : (
        <ul aria-label="Audit log" className="divide-y rounded-lg border">
          {events.map((event) => (
            <EventRow event={event} format={format} key={event.id} />
          ))}
        </ul>
      )}

      <LoadMore
        count={events.length}
        error={list.error}
        hasMore={list.hasMore}
        labels={{
          loadMore: "Load more",
          loading: "Loading…",
          retry: "Try again",
        }}
        loading={list.loading}
        onLoadMore={list.loadMore}
      />
    </div>
  );
}
