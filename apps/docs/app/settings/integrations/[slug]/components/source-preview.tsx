"use client";

import { Spinner } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import type { SourceItem } from "@repo/integrations";
import { ExportSquare, ImportCurve } from "iconsax-reactjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DataConnectionError,
  isIntegrationsMock,
  loadSourcePage,
} from "@/lib/data-connections/client";

const WHERE: Record<string, string> = {
  stripe: "the URL type in the editor and Dashboard → New code",
  calendly: "the URL type in the editor and Dashboard → New code",
  shopify: "the URL type in the editor and Dashboard → New code",
  calcom: "the Cal.com type in the editor",
};

/** What the picker will offer, plus Shopify's bulk CSV. */
export function SourcePreview({ slug, name }: { slug: string; name: string }) {
  const [items, setItems] = useState<SourceItem[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSourcePage(slug, {})
      .then((page) => {
        if (cancelled) return;
        setItems(page.items.slice(0, 6));
        setMore(page.items.length > 6 || Boolean(page.nextCursor));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof DataConnectionError ? err.message : "Couldn't load.");
        setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Ready to pick</h2>
          <p className="text-muted-foreground text-sm text-pretty">
            Choose <span className="text-foreground">From your account → {name}</span> in {WHERE[slug]}.
          </p>
        </div>
        {slug === "shopify" && (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a
                download
                href={
                  isIntegrationsMock() ? "#" : "/api/integrations/sources/shopify/export"
                }
              >
                <ImportCurve aria-hidden className="size-4" />
                Download products CSV
              </a>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/dashboard/codes/import">Bulk import</Link>
            </Button>
          </div>
        )}
      </div>

      {items === null ? (
        <div className="flex justify-center p-6">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="rounded-md bg-muted p-3 text-muted-foreground text-sm text-pretty">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing to pick yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li className="flex items-center gap-3 px-4 py-2.5" key={item.id}>
              {item.image && (
                <img alt="" className="size-9 shrink-0 rounded-md bg-muted object-cover" src={item.image} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{item.title}</p>
                <p className="truncate text-muted-foreground text-xs">
                  {[item.subtitle, item.url.replace(/^https?:\/\//, "")].filter(Boolean).join(" · ")}
                </p>
              </div>
              {item.badge && (
                <Badge className="shrink-0 font-normal" variant="outline">
                  {item.badge}
                </Badge>
              )}
              <a
                aria-label={`Open ${item.title}`}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                href={item.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExportSquare aria-hidden className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {more && <p className="text-muted-foreground text-xs">And more in the picker.</p>}
      {slug === "shopify" && (
        <p className="text-muted-foreground text-xs text-pretty">
          The CSV has one row per active product (up to 1,000) in the importer's
          format: destination, title, folder and tags. Import it to make a dynamic
          code for each product.
        </p>
      )}
    </div>
  );
}
