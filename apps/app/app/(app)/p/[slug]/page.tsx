import type { Locale } from "@repo/i18n/config";
import { localizePath } from "@repo/i18n/paths";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  CUSTOM_DOMAIN_HEADER,
  isCustomDomainRequest,
} from "@/app/(app)/dashboard/domains/_lib/hostname";
import { scopeCustomCss } from "@/components/landing/custom-css";
import { LandingPageFooter } from "@/components/landing/page-footer";
import { Pixels } from "@/components/landing/pixels";
import { PreciseLocationPrompt } from "@/components/landing/precise-location";
import { LandingRender } from "@/components/landing/render";
import { negotiateLocale } from "@/lib/i18n/accept-language";
import { requestAppLocale } from "@/lib/i18n/request-locale";
import { scanPagesIntl } from "@/lib/i18n/scan-pages";
import type { BlockRenderContext } from "@/lib/landing/blocks";
import { baseUrl } from "@/lib/metadata";
import { enforcePageLifecycle } from "@/lib/redirect/lifecycle";
import { loadPublicPage, pageSummary } from "../_lib/public-page";

// Hosted landing pages (qr_code.kind = 'page'), reached via /q/<slug> or
// directly. Customer pages: no QRdx analytics or chat widgets load here (see
// components/landing/customer-page-paths.ts); pixels only when the owner set them.
// The page is the owner's writing (<html lang> stays as it is); QRdx's own
// words around and inside the blocks follow the scanner's Accept-Language,
// per request (lib/i18n/scan-pages.ts). The page is dynamic and never cached.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/** The scanner's language, from Accept-Language (never stored or cached). */
async function scannerLocale(): Promise<Locale> {
  return negotiateLocale((await headers()).get("accept-language"));
}

async function load(slug: string) {
  const customDomainId = (await headers()).get(CUSTOM_DOMAIN_HEADER);
  return loadPublicPage({ slug }, customDomainId);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) {
    const { t } = await scanPagesIntl(await scannerLocale());
    return {
      title: { absolute: t("hosted.notFoundTitle") },
      robots: { index: false },
    };
  }

  // Never leak a password-protected page's details into its share preview.
  if (page.code.passwordHash) {
    const { t } = await scanPagesIntl(await scannerLocale());
    return {
      title: { absolute: t("hosted.passwordProtected") },
      robots: { index: false, follow: false },
      openGraph: null,
      twitter: null,
    };
  }

  const { title, description, image, icon } = pageSummary(page);
  const images = image ? [{ url: image }] : undefined;
  return {
    title: { absolute: title },
    description: description || null,
    robots: page.settings.indexable
      ? { index: true, follow: true }
      : { index: false, follow: false },
    // Customer pages: drop QRdx's own site metadata from the root layout.
    applicationName: null,
    keywords: null,
    authors: null,
    creator: null,
    manifest: null,
    openGraph: {
      type: "website",
      title,
      description: description || undefined,
      siteName: title,
      images,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description: description || undefined,
      images,
    },
    // White-label (Business): the page's own logo instead of the QRdx favicon.
    ...(page.branding.whiteLabel && icon && { icons: { icon, apple: icon } }),
  };
}

export default async function LandingPage({ params }: Props) {
  // Before anything renders: the blocks' useTranslations (server
  // components) and not-found.tsx read this request's locale from here.
  const locale = await scannerLocale();
  requestAppLocale().current = locale;
  const { slug } = await params;
  const page = await load(slug);
  if (!page) notFound();
  // Password gate, schedule, scan limit and pause apply to direct visits too.
  await enforcePageLifecycle(page.code);

  const requestHeaders = await headers();
  const context: BlockRenderContext = {
    theme: page.content.theme,
    mode: "live",
    pageId: page.page.id,
    qrCodeId: page.code.id,
    userAgent: requestHeaders.get("user-agent"),
  };

  // Business only; on a downgrade the page keeps rendering without it.
  const css =
    page.branding.customCss && page.settings.customCss.trim()
      ? scopeCustomCss(page.settings.customCss)
      : null;

  const reportHref = new URL(
    `/report-abuse?slug=${encodeURIComponent(slug)}`,
    baseUrl,
  ).href;
  // QRdx's home in the language the scanner reads ("/hi").
  const badgeHref = new URL(
    `${localizePath("/", locale)}?ref=made-with-qrdx`,
    baseUrl,
  ).href;

  return (
    <>
      <LandingRender
        content={page.content}
        context={context}
        customCss={css?.ok ? css.css : null}
        footer={
          <LandingPageFooter
            badge={page.branding.badge}
            badgeHref={badgeHref}
            reportHref={reportHref}
          />
        }
      />
      <Pixels
        customDomain={isCustomDomainRequest(requestHeaders)}
        pageId={page.page.id}
        pixels={page.code.pixels}
        qrCodeId={page.code.id}
      />
      {/* Only when the code asks for precise location (lib/scan-location). */}
      <PreciseLocationPrompt
        pixels={page.code.pixels}
        plan={page.plan}
        qrCodeId={page.code.id}
      />
    </>
  );
}
