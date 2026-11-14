import { HairlineFigure } from "@repo/design-system/components/hairline/hairline";
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
import { ArrowLeft, Import as Download } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListPagination } from "@/app/(app)/dashboard/_components/list-pagination";
import { PageHeader } from "@/app/(app)/dashboard/_components/page-header";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { ResponseUsage } from "@/app/(app)/dashboard/pages/[id]/responses/_components/response-usage";
import {
  type ResponseItem,
  ResponsesList,
} from "@/app/(app)/dashboard/pages/[id]/responses/_components/responses-list";
import {
  countCouponRedemptions,
  countPageResponses,
  countResponsesByBlock,
  getFormResponseUsage,
  getInboxPage,
  listPageResponses,
} from "@/app/api/forms/_lib/responses";
import { SheetsExport } from "@/components/data-connections/sheets-export";
import { HttpError } from "@/lib/error-response";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { loadPage, parsePage } from "@/lib/paging";
import { can } from "@/lib/permissions";
import { workspaceHref } from "@/lib/workspace-paths";

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
  params: Promise<{ workspace: string; id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const t = await getAppTranslations("app.dashboard.pages.responses.page");
  const scope = await requireDashboardScope();
  const [{ workspace, id }, query] = await Promise.all([params, searchParams]);
  const pageHref = (pageId: string) =>
    workspaceHref(workspace, `/pages/${encodeURIComponent(pageId)}`);
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

  const [{ responses, total, page: pageNumber }, usage, redemptions] =
    await Promise.all([
      // Past the last page (an old link, responses deleted since): the last page.
      loadPage(
        parsePage(query.page),
        async (pageNumber) => {
          const [responses, total] = await Promise.all([
            listPageResponses(page.id, {
              block: formFilter,
              limit: PAGE_SIZE,
              offset: (pageNumber - 1) * PAGE_SIZE,
            }),
            countPageResponses(page.id, formFilter),
          ]);
          return { responses, total };
        },
        PAGE_SIZE,
      ),
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

  const base = `${pageHref(page.id)}/responses`;
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
  const canDelete =
    can(scope.role, "content.write") &&
    (!scope.organizationId ||
      can(scope.role, "content.manageAll") ||
      page.userId === scope.userId);
  const coupons = page.coupons.filter(
    (coupon) => coupon.redeemable || (redemptions.get(coupon.id) ?? 0) > 0,
  );

  return (
    <div className="space-y-6">
      <Button asChild size="sm" variant="ghost">
        <Link href={pageHref(page.id)}>
          <ArrowLeft />
          {t("backToPage")}
        </Link>
      </Button>

      <PageHeader
        description={`Answers sent from the forms on ${page.title ? `"${page.title}"` : "this page"}.`}
        title={t("responses")}
      >
        {total > 0 && (
          <Button asChild size="sm" variant="outline">
            <a
              download
              href={`${base}/export${formFilter ? `?form=${encodeURIComponent(formFilter)}` : ""}`}
            >
              <Download />
              {t("exportCsv")}
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
            <CardTitle>{t("couponRedemptions")}</CardTitle>
            <CardDescription>{t("tapsOnRedeemOnePhone")}</CardDescription>
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
        <nav aria-label={t("forms")} className="flex flex-wrap gap-1">
          {[
            {
              id: null,
              label: t("allForms"),
              count: [...byBlock.values()].reduce((a, b) => a + b, 0),
            },
            ...[...formIds].map((formId) => ({
              id: formId,
              label: titles.get(formId) ?? t("removedForm"),
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
          <HairlineFigure className="aspect-square w-32" figure="PageForm" />
          <EmptyHeader>
            <EmptyTitle>{t("noResponsesYet")}</EmptyTitle>
            <EmptyDescription>
              {page.forms.length === 0
                ? t("addAFormBlockTo")
                : t("responsesShowUpHereAs")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild size="sm" variant="outline">
              <Link href={pageHref(page.id)}>
                {page.forms.length === 0
                  ? t("addAForm")
                  : t("openThePageEditor")}
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ResponsesList canDelete={canDelete} items={items} pageId={page.id} />
      )}

      <ListPagination
        labels={{
          navigation: t("pagination"),
          previous: t("newer"),
          next: t("older"),
        }}
        nextHref={pageNumber < pages ? href({ page: pageNumber + 1 }) : null}
        previousHref={pageNumber > 1 ? href({ page: pageNumber - 1 }) : null}
        summary={t("pageValueOfPagesValue2", {
          value: pageNumber,
          pages,
          value2: total.toLocaleString("en-US"),
        })}
      />
    </div>
  );
}
