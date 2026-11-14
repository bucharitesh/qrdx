import { JsonLd } from "@repo/design-system/components/seo/json-ld";
import { localizeHref } from "@repo/i18n/paths";
import { Barcode, ScanBarcode } from "iconsax-reactjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ClientContent } from "@/components/i18n/client-content";
import { ClientMessages } from "@/components/i18n/client-messages";
import { LocaleLink } from "@/components/i18n/locale-link";
import {
  CardGrid,
  LinkCard,
  SectionLink,
  textLinkClass,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { PublicBarcodeGenerator } from "@/components/sections/tools/save-barcode";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { apiBaseUrl } from "@/lib/agents/hosts";
import { MM_PER_UNIT, MODULE_UNITS } from "@/lib/barcode/draw";
import { BARCODE_FILES } from "@/lib/barcode/files";
import {
  BARCODE_FORMATS,
  type BarcodeFormatId,
  expandUpce,
  getBarcodeFormat,
  gs1CheckDigit,
  validateBarcodeInput,
} from "@/lib/barcode/formats";
import { defaultBarcodeStyle } from "@/lib/barcode/style";
import { BARCODE_CONTENT_RULES } from "@/lib/i18n/content-rules";
import { localizeContent } from "@/lib/i18n/content-server";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { baseUrl } from "@/lib/metadata";
import { buildTimeParams } from "@/lib/static-params";
import {
  BARCODE_FORMAT_PAGES,
  barcodeFormatPath,
  DOWNLOAD_SIZES_MM,
  GS1_AI_NAMES,
  getBarcodeFormatPage,
} from "./content";

interface PageProps {
  params: Promise<{ format: string }>;
}

/** What the client generator shows from lib/barcode (components/i18n/content-text.tsx). */
const GENERATOR_CONTENT = { formats: BARCODE_FORMATS, files: BARCODE_FILES };

/** The format's page and copy in the page's language, or a 404. */
async function load(params: PageProps["params"]) {
  const [{ format: slug }, locale] = await Promise.all([
    params,
    requireLocale(),
  ]);
  const source = getBarcodeFormatPage(slug);
  if (!source) notFound();
  const [content, format, aiNames, t] = await Promise.all([
    localizeContent(source, locale),
    localizeContent(getBarcodeFormat(source.id), locale, BARCODE_CONTENT_RULES),
    localizeContent(GS1_AI_NAMES, locale),
    getTranslations({ locale, namespace: "barcodeFormat" }),
  ]);
  return { locale, content, format, aiNames, t };
}

// Unknown formats render notFound() below (lib/static-params.ts).
export function generateStaticParams() {
  return buildTimeParams(() =>
    BARCODE_FORMAT_PAGES.map((page) => ({ format: page.slug })),
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale, content } = await load(params);
  return localizedMetadata({
    locale,
    path: barcodeFormatPath(content.id),
    title: content.title,
    description: content.metaDescription,
    ownOgImage: true,
  });
}

/** Formats whose number ends in a GS1 check digit (EAN, UPC, ITF-14, GTIN). */
const GS1_NUMBERS = new Set<BarcodeFormatId>([
  "ean13",
  "ean8",
  "upca",
  "upce",
  "itf14",
  "gs1-128",
]);

/**
 * The digits a worked check digit example runs over: the example without
 * its check digit (UPC-E: its expanded UPC-A; GS1-128: the GTIN in (01)).
 */
function checkBody(id: BarcodeFormatId, value: string): string | null {
  switch (id) {
    case "ean13":
    case "ean8":
    case "upca":
    case "itf14":
      return value.slice(0, -1);
    case "upce":
      return expandUpce(value).slice(0, 11);
    case "gs1-128":
      return /\(01\)(\d{13})\d/.exec(value)?.[1] ?? null;
    default:
      return null;
  }
}

/** The GS1 weights (3, 1, 3… from the right) under each digit of `body`. */
function weighted(body: string) {
  return [...body].map((digit, index) => {
    const weight = (body.length - 1 - index) % 2 === 0 ? 3 : 1;
    return { position: index, digit, weight, product: Number(digit) * weight };
  });
}

/** "(01)0950…(10)AB-123" → [{ ai: "01", value: "0950…" }, …] */
function gs1Fields(value: string) {
  return [...value.matchAll(/\((\d{2,4})\)([^()]*)/g)].map((match) => ({
    ai: match[1] as string,
    value: match[2] as string,
  }));
}

const mm = (value: number) => Math.round(value * 1000) / 1000;

export default async function BarcodeFormatPage({ params }: PageProps) {
  const { locale, content, format, aiNames, t } = await load(params);
  const [common, hub] = await Promise.all([
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "barcodeGenerator" }),
  ]);
  const { id, label } = format;
  const path = barcodeFormatPath(id);
  const pageUrl = new URL(localizeHref(path, locale), baseUrl).toString();
  const linear = format.kind === "linear";

  const checked = validateBarcodeInput(id, format.example);
  const value = checked.ok ? checked.value : format.example;
  const body = checkBody(id, value);
  const digits = body ? weighted(body) : [];
  const sum = digits.reduce((total, item) => total + item.product, 0);
  const check = body ? gs1CheckDigit(body) : null;
  const fields = id === "gs1-128" ? gs1Fields(value) : [];

  const style = defaultBarcodeStyle(id);
  const size = DOWNLOAD_SIZES_MM[id];
  const moduleMm = mm(MODULE_UNITS[id] * MM_PER_UNIT);
  const api = `${apiBaseUrl(baseUrl)}/barcode?format=${id}&data=${encodeURIComponent(value)}`;

  const others = await localizeContent(
    BARCODE_FORMATS.filter((item) => item.id !== id),
    locale,
    BARCODE_CONTENT_RULES,
  );

  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: `QRdx ${label} barcode generator`,
          url: pageUrl,
          applicationCategory: "UtilitiesApplication",
          operatingSystem: "Any (web browser)",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          featureList: [
            `${label} barcodes`,
            ...(GS1_NUMBERS.has(id)
              ? ["Check digits calculated and verified"]
              : []),
            "Scan check with an open-source decoder",
            "PNG, JPG, WebP, AVIF, SVG, PDF and EPS downloads",
            "Barcode image API with no key",
          ],
        }}
      />
      <ToolHero
        pattern="ramp"
        crumbs={[
          { name: common("home"), path: "/" },
          { name: common("tools"), path: "/tools" },
          { name: hub("crumb"), path: "/barcode-generator" },
          { name: label, path },
        ]}
        title={content.title}
        intro={[content.intro]}
      />

      <section
        aria-label={t("toolLabel", { name: label })}
        className="w-full px-10 py-10"
      >
        <ClientMessages namespaces={["barcodeTool", "editor.connections"]}>
          <ClientContent data={GENERATOR_CONTENT} rules={BARCODE_CONTENT_RULES}>
            <PublicBarcodeGenerator format={id} />
          </ClientContent>
        </ClientMessages>
      </section>

      <section className="grid w-full grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="px-10 py-10 flex flex-col gap-4 min-w-0">
          <h2 className="text-2xl font-medium tracking-tighter">
            {t("usedTitle", { name: label })}
          </h2>
          {content.usedFor.map((paragraph) => (
            <p
              key={paragraph}
              className="text-muted-foreground leading-relaxed text-pretty"
            >
              {paragraph}
            </p>
          ))}
          <h2 className="mt-4 text-2xl font-medium tracking-tighter">
            {content.numbers.title}
          </h2>
          {content.numbers.paragraphs.map((paragraph) => (
            <p
              key={paragraph}
              className="text-muted-foreground leading-relaxed text-pretty"
            >
              {paragraph}
            </p>
          ))}
        </div>

        <div className="px-10 py-10 flex flex-col gap-4 min-w-0">
          <h2 className="text-2xl font-medium tracking-tighter">
            {GS1_NUMBERS.has(id)
              ? t("rulesTitle", { name: label })
              : t("rulesTitleText", { name: label })}
          </h2>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("takesLabel")}
            </p>
            <p className="text-sm text-foreground/80 leading-relaxed text-pretty">
              {format.inputHint}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("exampleLabel")}
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-all">
              <code>{value}</code>
            </pre>
          </div>
          {fields.length > 0 && (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
              {fields.map((field) => (
                <div key={field.ai} className="contents">
                  <dt className="font-mono text-foreground">
                    ({field.ai}) {field.value}
                  </dt>
                  <dd className="text-muted-foreground">
                    {aiNames[field.ai] ?? ""}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {content.rules.map((paragraph) => (
            <p
              key={paragraph}
              className="text-sm text-muted-foreground leading-relaxed text-pretty"
            >
              {paragraph}
            </p>
          ))}
          {body && check !== null && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {id === "upce"
                  ? t("checkTitleUpce", { upce: value, upca: body + check })
                  : t("checkTitle", { body })}
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-center font-mono text-xs">
                  <caption className="sr-only">
                    {t("checkCaption", { body })}
                  </caption>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <th
                        scope="row"
                        className="px-2 py-1.5 text-left font-sans font-medium text-muted-foreground"
                      >
                        {t("checkDigits")}
                      </th>
                      {digits.map((item) => (
                        <td
                          key={item.position}
                          className="px-1.5 py-1.5 text-foreground"
                        >
                          {item.digit}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th
                        scope="row"
                        className="px-2 py-1.5 text-left font-sans font-medium text-muted-foreground"
                      >
                        {t("checkWeights")}
                      </th>
                      {digits.map((item) => (
                        <td
                          key={item.position}
                          className="px-1.5 py-1.5 text-muted-foreground"
                        >
                          ×{item.weight}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th
                        scope="row"
                        className="px-2 py-1.5 text-left font-sans font-medium text-muted-foreground"
                      >
                        {t("checkProducts")}
                      </th>
                      {digits.map((item) => (
                        <td
                          key={item.position}
                          className="px-1.5 py-1.5 text-foreground"
                        >
                          {item.product}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
                {t("checkSum", {
                  sum,
                  next: sum + check,
                  check,
                })}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="grid w-full grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="px-10 py-10 flex flex-col gap-4 min-w-0">
          <h2 className="text-2xl font-medium tracking-tighter">
            {t("sizeTitle", { name: label })}
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">
                {t("sizeCaption", { name: label })}
              </caption>
              <tbody className="divide-y divide-border">
                <tr>
                  <th
                    scope="row"
                    className="px-3 py-2 text-left font-normal text-secondary-foreground"
                  >
                    {t("sizeDownload")}
                  </th>
                  <td className="px-3 py-2 text-muted-foreground">
                    {t("sizeMm", { width: size.width, height: size.height })}
                  </td>
                </tr>
                <tr>
                  <th
                    scope="row"
                    className="px-3 py-2 text-left font-normal text-secondary-foreground"
                  >
                    {linear ? t("sizeModule") : t("sizeCell")}
                  </th>
                  <td className="px-3 py-2 text-muted-foreground">
                    {t("sizeModuleValue", { size: moduleMm })}
                  </td>
                </tr>
                {linear && (
                  <tr>
                    <th
                      scope="row"
                      className="px-3 py-2 text-left font-normal text-secondary-foreground"
                    >
                      {t("sizeBarHeight")}
                    </th>
                    <td className="px-3 py-2 text-muted-foreground">
                      {t("sizeModuleValue", { size: style.barHeightMm })}
                    </td>
                  </tr>
                )}
                <tr>
                  <th
                    scope="row"
                    className="px-3 py-2 text-left font-normal text-secondary-foreground"
                  >
                    {t("sizeQuietZone")}
                  </th>
                  <td className="px-3 py-2 text-muted-foreground">
                    {linear
                      ? t("quietModules", {
                          min: format.quietZone.min,
                          start: format.quietZone.default,
                        })
                      : t("quietCells", {
                          min: format.quietZone.min,
                          start: format.quietZone.default,
                        })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground leading-relaxed">
            {content.sizing.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>

        <div className="px-10 py-10 flex flex-col gap-4 min-w-0">
          <h2 className="text-2xl font-medium tracking-tighter">
            {t("apiTitle", { name: label })}
          </h2>
          <p className="text-muted-foreground leading-relaxed text-pretty">
            {t.rich("apiDescription", {
              docs: (chunks) => (
                <LocaleLink
                  href="/docs/developers/barcode-api"
                  className={textLinkClass}
                >
                  {chunks}
                </LocaleLink>
              ),
            })}
          </p>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("apiSvg")}
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-all">
              <code>{api}</code>
            </pre>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("apiPng")}
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-all">
              <code>{`${api}&type=png&scale=3`}</code>
            </pre>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("apiHtml")}
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-all">
              <code>{`<img src="${api}" alt="${label} ${value}" />`}</code>
            </pre>
          </div>
        </div>
      </section>

      <FaqList title={t("faqTitle", { name: label })} faqs={content.faqs} />

      <section className="w-full px-10 py-10 flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("otherTitle")}
          </h2>
          <SectionLink href="/barcode-generator">
            {t("allFormats", { count: BARCODE_FORMATS.length })}
          </SectionLink>
        </div>
        <CardGrid count={others.length}>
          {others.map((item) => (
            <LinkCard
              key={item.id}
              href={barcodeFormatPath(item.id)}
              icon={item.kind === "linear" ? Barcode : ScanBarcode}
              title={t("otherCard", { name: item.label })}
              description={item.summary}
            />
          ))}
        </CardGrid>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t.rich("qrNote", {
            generators: (chunks) => (
              <LocaleLink href="/qr-code-generator" className={textLinkClass}>
                {chunks}
              </LocaleLink>
            ),
          })}
        </p>
      </section>
    </main>
  );
}
