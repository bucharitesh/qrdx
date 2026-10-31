import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CUSTOM_DOMAIN_HEADER } from "@/app/dashboard/domains/_lib/hostname";
import { scopeCustomCss } from "@/components/landing/custom-css";
import { LandingPageFooter } from "@/components/landing/page-footer";
import { Pixels } from "@/components/landing/pixels";
import { LandingRender } from "@/components/landing/render";
import type { BlockRenderContext } from "@/lib/landing/blocks";
import { baseUrl } from "@/lib/metadata";
import { enforcePageLifecycle } from "@/lib/redirect/lifecycle";
import { loadPublicPage, pageSummary } from "../_lib/public-page";

// Hosted landing pages (qr_code.kind = 'page'), reached via /q/<slug> or
// directly. Customer pages: no QRdx analytics or chat widgets load here (see
// components/landing/customer-page-paths.ts); pixels only when the owner set them.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const customDomainId = (await headers()).get(CUSTOM_DOMAIN_HEADER);
  return loadPublicPage({ slug }, customDomainId);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return { title: "Page not found", robots: { index: false } };

  // Never leak a password-protected page's details into its share preview.
  if (page.code.passwordHash) {
    return {
      title: { absolute: "Password protected" },
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
  const { slug } = await params;
  const page = await load(slug);
  if (!page) notFound();
  // Password gate, schedule, scan limit and pause apply to direct visits too.
  await enforcePageLifecycle(page.code);

  const context: BlockRenderContext = {
    theme: page.content.theme,
    mode: "live",
    pageId: page.page.id,
    qrCodeId: page.code.id,
    userAgent: (await headers()).get("user-agent"),
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
  const badgeHref = new URL("/?ref=made-with-qrdx", baseUrl).href;

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
        pageId={page.page.id}
        pixels={page.code.pixels}
        qrCodeId={page.code.id}
      />
    </>
  );
}
