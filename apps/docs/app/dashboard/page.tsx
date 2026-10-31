import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { Input } from "@repo/design-system/components/ui/input";
import { QrCode } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/app/dashboard/_components/page-header";
import { CodesTable } from "@/app/dashboard/codes/_components/codes-table";
import {
  NewCodeButton,
  UsageMeter,
} from "@/app/dashboard/codes/_components/usage";
import {
  getCodeUsage,
  listCodes,
  requireDashboardScope,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { getScanSparklines } from "@/lib/scans";

export const metadata: Metadata = {
  title: "Dynamic QR codes",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

function parsePage(value: SearchParams[string]): number {
  const page = Number.parseInt(String(value ?? "1"), 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function pageHref(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const scope = await requireDashboardScope();
  const params = await searchParams;
  const status = params.status === "archived" ? "archived" : "active";
  const q =
    typeof params.q === "string" ? params.q.trim().slice(0, 200) : undefined;
  const page = parsePage(params.page);

  const [usage, { codes, total }] = await Promise.all([
    getCodeUsage(scope),
    listCodes(scope, {
      status,
      q,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  ]);
  const sparklines = Object.fromEntries(
    await getScanSparklines(codes.map((code) => code.id)),
  );

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isEmpty = total === 0 && !q && status === "active";
  const linkParams = { status: status === "archived" ? status : undefined, q };

  return (
    <div className="space-y-6">
      <PageHeader
        description="Print once, then change where your codes point and see every scan."
        title="Dynamic QR codes"
      >
        <NewCodeButton usage={usage} />
      </PageHeader>

      <UsageMeter usage={usage} />

      {isEmpty ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <QrCode />
            </EmptyMedia>
            <EmptyTitle>No dynamic QR codes yet</EmptyTitle>
            <EmptyDescription>
              A dynamic code encodes a short link. Print it once and change the
              destination whenever you like, with scan analytics included.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NewCodeButton usage={usage}>
              Create your first dynamic QR code
            </NewCodeButton>
            <p className="text-muted-foreground text-xs">
              Or turn on "Make it dynamic" for a URL code in the{" "}
              <Link className="underline" href="/playground">
                playground
              </Link>
              .
            </p>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              {(["active", "archived"] as const).map((value) => (
                <Button
                  asChild
                  key={value}
                  size="sm"
                  variant={value === status ? "secondary" : "ghost"}
                >
                  <Link
                    href={pageHref({
                      status: value === "archived" ? value : undefined,
                      q,
                    })}
                  >
                    {value === "active" ? "Active" : "Archived"}
                  </Link>
                </Button>
              ))}
            </div>
            <form action="/dashboard" className="flex gap-2" method="get">
              {status === "archived" && (
                <input name="status" type="hidden" value="archived" />
              )}
              <Input
                aria-label="Search codes"
                className="sm:w-64"
                defaultValue={q}
                name="q"
                placeholder="Search title, URL or slug"
                type="search"
              />
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>
          </div>

          {codes.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border py-10 text-center text-sm">
              {q
                ? `No codes match "${q}".`
                : status === "archived"
                  ? "No archived codes."
                  : "No active codes. Restore one from Archived or create a new one."}
            </p>
          ) : (
            <div className="rounded-lg border">
              <CodesTable codes={codes} sparklines={sparklines} />
            </div>
          )}

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                Page {Math.min(page, pageCount)} of {pageCount} · {total} codes
              </span>
              <div className="flex gap-2">
                <Button
                  asChild={page > 1}
                  disabled={page <= 1}
                  size="sm"
                  variant="outline"
                >
                  {page > 1 ? (
                    <Link
                      href={pageHref({
                        ...linkParams,
                        page: String(page - 1),
                      })}
                    >
                      Previous
                    </Link>
                  ) : (
                    "Previous"
                  )}
                </Button>
                <Button
                  asChild={page < pageCount}
                  disabled={page >= pageCount}
                  size="sm"
                  variant="outline"
                >
                  {page < pageCount ? (
                    <Link
                      href={pageHref({
                        ...linkParams,
                        page: String(page + 1),
                      })}
                    >
                      Next
                    </Link>
                  ) : (
                    "Next"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
