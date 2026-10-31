import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowLeft,
  ArrowLeft2 as ChevronLeft,
  ArrowRight2 as ChevronRight,
  Import as Download,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  countCouponRedemptions,
  countPageResponses,
  countResponsesByBlock,
  getFormResponseUsage,
  getInboxPage,
  listPageResponses,
} from "@/app/api/forms/_lib/responses";
import { PageHeader } from "@/app/dashboard/_components/page-header";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import { SheetsExport } from "@/components/data-connections/sheets-export";
import { HairlineFigure } from "@/components/mockups/hairline";
import { HttpError } from "@/lib/error-response";
import { ResponseUsage } from "./_components/response-usage";
import { type ResponseItem, ResponsesList } from "./_components/responses-list";

export const metadata: Metadata = {
  title: "Form responses",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function FormResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const scope = await requireDashboardScope();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const page = await getInboxPage(scope, id).catch((error: unknown) => {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  });

  const byBlock = await countResponsesByBlock(page.id);
  // Current forms first, then removed forms that still have responses.
  const formIds = new Set(
    [...page.forms.map((form) => form.id), ...byBlock.keys()].filter(Boolean),
  );
  const requested = first(query.form) ?? null;
  const formFilter = requested && formIds.has(requested) ? requested : null;
  const pageNumber = Math.max(
    1,
    Number.parseInt(first(query.page) ?? "1", 10) || 1,
  );

  const [responses, total, usage, redemptions] = await Promise.all([
    listPageResponses(page.id, {
      block: formFilter,
      limit: PAGE_SIZE,
      offset: (pageNumber - 1) * PAGE_SIZE,
    }),
    countPageResponses(page.id, formFilter),
    getFormResponseUsage(scope),
    page.coupons.length > 0
      ? countCouponRedemptions(page.id)
      : Promise.resolve(new Map<string, number>()),
  ]);

  const titles = new Map(page.forms.map((form) => [form.id, form.title]));
  const multipleForms = formIds.size > 1;
  const items: ResponseItem[] = responses.map((response) => ({
    id: response.id,
    createdAt: response.createdAt.toISOString(),
    codeSlug: response.codeSlug,
    formTitle:
      multipleForms && !formFilter
        ? (titles.get(response.data.block) ?? "Removed form")
        : null,
    answers: response.data.answers,
  }));

  const base = `/dashboard/pages/${encodeURIComponent(page.id)}/responses`;
  const href = (changes: { form?: string | null; page?: number }) => {
    const params = new URLSearchParams();
    const form = changes.form === undefined ? formFilter : changes.form;
    if (form) params.set("form", form);
    if (changes.page && changes.page > 1)
      params.set("page", String(changes.page));
    const search = params.toString();
    return search ? `${base}?${search}` : base;
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canDelete = !(
    scope.organizationId &&
    scope.role === "member" &&
    page.userId !== scope.userId
  );
  const coupons = page.coupons.filter(
    (coupon) => coupon.redeemable || (redemptions.get(coupon.id) ?? 0) > 0,
  );

  return (
    <div className="space-y-6">
      <Button asChild size="sm" variant="ghost">
        <Link href={`/dashboard/pages/${encodeURIComponent(page.id)}`}>
          <ArrowLeft />
          Back to page
        </Link>
      </Button>

      <PageHeader
        description={`Answers sent from the forms on ${page.title ? `"${page.title}"` : "this page"}.`}
        title="Responses"
      >
        {total > 0 && (
          <Button asChild size="sm" variant="outline">
            <a
              download
              href={`${base}/export${formFilter ? `?form=${encodeURIComponent(formFilter)}` : ""}`}
            >
              <Download />
              Export CSV
            </a>
          </Button>
        )}
        {total > 0 && <SheetsExport pageId={page.id} />}
      </PageHeader>

      <ResponseUsage
        limit={usage.limit}
        plan={usage.plan}
        resetsAt={usage.resetsAt.toISOString()}
        used={usage.used}
      />

      {coupons.length > 0 && (
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle>Coupon redemptions</CardTitle>
            <CardDescription>
              Taps on Redeem. One phone counts once, but the same code can still
              be shown on another phone.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <ul className="divide-y text-sm">
              {coupons.map((coupon) => (
                <li
                  className="flex items-center justify-between gap-3 py-2"
                  key={coupon.id}
                >
                  <span className="min-w-0 truncate">{coupon.headline}</span>
                  <span className="font-medium tabular-nums">
                    {(redemptions.get(coupon.id) ?? 0).toLocaleString("en-US")}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {multipleForms && (
        <nav aria-label="Forms" className="flex flex-wrap gap-1">
          {[
            {
              id: null,
              label: "All forms",
              count: [...byBlock.values()].reduce((a, b) => a + b, 0),
            },
            ...[...formIds].map((formId) => ({
              id: formId,
              label: titles.get(formId) ?? "Removed form",
              count: byBlock.get(formId) ?? 0,
            })),
          ].map((tab) => (
            <Button
              asChild
              key={tab.id ?? "all"}
              size="sm"
              variant={tab.id === formFilter ? "secondary" : "ghost"}
            >
              <Link
                aria-current={tab.id === formFilter ? "true" : undefined}
                href={href({ form: tab.id, page: 1 })}
                scroll={false}
              >
                {tab.label}
                <span className="text-muted-foreground tabular-nums">
                  {tab.count}
                </span>
              </Link>
            </Button>
          ))}
        </nav>
      )}

      {items.length === 0 ? (
        <Empty className="border">
          <HairlineFigure className="aspect-square w-32" figure="Stack" />
          <EmptyHeader>
            <EmptyTitle>No responses yet</EmptyTitle>
            <EmptyDescription>
              {page.forms.length === 0
                ? "Add a Form block to this page to collect feedback, sign-ups or contact details."
                : "Responses show up here as soon as visitors send the form on your published page."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/pages/${encodeURIComponent(page.id)}`}>
                {page.forms.length === 0
                  ? "Add a form"
                  : "Open the page editor"}
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ResponsesList canDelete={canDelete} items={items} pageId={page.id} />
      )}

      {pages > 1 && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between gap-3 text-sm"
        >
          <Button
            asChild={pageNumber > 1}
            className={cn(pageNumber <= 1 && "invisible")}
            size="sm"
            variant="outline"
          >
            {pageNumber > 1 ? (
              <Link href={href({ page: pageNumber - 1 })}>
                <ChevronLeft />
                Newer
              </Link>
            ) : (
              <span>Newer</span>
            )}
          </Button>
          <span className="text-muted-foreground tabular-nums">
            Page {Math.min(pageNumber, pages)} of {pages} ·{" "}
            {total.toLocaleString("en-US")} responses
          </span>
          <Button
            asChild={pageNumber < pages}
            className={cn(pageNumber >= pages && "invisible")}
            size="sm"
            variant="outline"
          >
            {pageNumber < pages ? (
              <Link href={href({ page: pageNumber + 1 })}>
                Older
                <ChevronRight />
              </Link>
            ) : (
              <span>Older</span>
            )}
          </Button>
        </nav>
      )}
    </div>
  );
}
