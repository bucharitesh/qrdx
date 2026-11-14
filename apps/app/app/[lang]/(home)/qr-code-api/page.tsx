import { CANONICAL_ORIGIN } from "@repo/config";
import { JsonLd } from "@repo/design-system/components/seo/json-ld";
import { Card } from "@repo/design-system/components/ui/card";
import { localizeHref } from "@repo/i18n/paths";
import {
  ArrowRight2,
  Barcode,
  Cloud,
  Code,
  CommandSquare,
  Global,
  Lock1,
  MagicStar,
  Repeat,
  ScanBarcode,
  TickCircle,
  Timer1,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BODY_PATTERN } from "qrdx/types";
import { ClientMessages } from "@/components/i18n/client-messages";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { CodeSnippet } from "@/components/sections/integrations/code-snippet";
import {
  CardGrid,
  type CardIcon,
  IconTile,
  LinkCard,
  SectionHeading,
  textLinkClass,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { apiBaseUrl } from "@/lib/agents/hosts";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { baseUrl } from "@/lib/metadata";
import { getPlanLimits } from "@/lib/plans";
import { PRODUCT_FACTS } from "@/lib/product-facts";
import { LOGO_ICON_IDS } from "@/lib/qr-design/style";
import {
  QR_DATA_MAX_LENGTH,
  QR_DEFAULTS,
  QR_MARGIN_MAX,
  QR_SIZE_MAX,
  QR_SIZE_MIN,
  qrImageFormats,
} from "@/lib/qr-render";
import { API_DEFAULTS } from "./snippets";
import { UrlBuilder } from "./url-builder";

const perMinute = PRODUCT_FACTS.imageApiPerMinute;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "qrCodeApi" });
  return localizedMetadata({
    locale,
    path: "/qr-code-api",
    title: t("metaTitle"),
    description: t("metaDescription", { perMinute }),
    ownOgImage: true,
  });
}

/** The public API (api.qrdx.dev/v1, or a self-hosted copy's /api/v1). */
const API = apiBaseUrl(baseUrl);

const EXAMPLES = {
  markdown: `![QR code](${API}/qr?data=https://github.com/you/repo)`,
  html: [
    "<img",
    `  src="${API}/qr?data=${CANONICAL_ORIGIN}&size=256&fg=155dfc"`,
    '  width="256"',
    '  height="256"',
    '  alt="QR code for qrdx.dev"',
    "/>",
  ].join("\n"),
  curl: [
    "# A PNG for slides and documents",
    `curl -o qr.png "${API}/qr?data=${CANONICAL_ORIGIN}&format=png&size=1024"`,
    "",
    "# A vector EPS for print (size is the width in points)",
    `curl -o qr.eps "${API}/qr?data=${CANONICAL_ORIGIN}&format=eps&size=144"`,
  ].join("\n"),
  js: [
    'const link = "https://example.com/menu?table=12&lang=en";',
    "// Encode the data: it holds & and ?",
    "const src =",
    `  "${API}/qr?data=" +`,
    "  encodeURIComponent(link) +",
    '  "&logoIcon=link&level=H";',
    'document.querySelector("#menu-qr").src = src;',
  ].join("\n"),
} as const;

const LIMIT_ICONS = {
  rate: Timer1,
  cache: Cloud,
  cors: Global,
  private: Lock1,
  scan: ScanBarcode,
  selfHost: Code,
} as const satisfies Record<string, CardIcon>;

export default async function QrCodeApiPage() {
  const locale = await requireLocale();
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "qrCodeApi" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const pageUrl = new URL(localizeHref("/qr-code-api", locale), baseUrl);
  const freeDynamicCodes = getPlanLimits("free").dynamicCodes;
  const brands = PRODUCT_FACTS.brandLogos;
  const faqs = [
    {
      question: t("faq.freeQuestion"),
      answer: t("faq.freeAnswer", { perMinute }),
    },
    {
      question: t("faq.logoQuestion"),
      answer: t("faq.logoAnswer", { brands }),
    },
    {
      question: t("faq.formatsQuestion"),
      answer: t("faq.formatsAnswer", { min: QR_SIZE_MIN, max: QR_SIZE_MAX }),
    },
    { question: t("faq.expireQuestion"), answer: t("faq.expireAnswer") },
    {
      question: t("faq.dynamicQuestion"),
      answer: t("faq.dynamicAnswer", { count: freeDynamicCodes }),
    },
    { question: t("faq.googleQuestion"), answer: t("faq.googleAnswer") },
    { question: t("faq.limitQuestion"), answer: t("faq.limitAnswer") },
    { question: t("faq.aiQuestion"), answer: t("faq.aiAnswer") },
  ];
  const facts = [
    t("facts.noKey"),
    t("facts.rateLimit", { perMinute }),
    t("facts.formats"),
    t("facts.openSource"),
  ];
  const limits = [
    {
      icon: LIMIT_ICONS.rate,
      title: t("limits.rateTitle", { perMinute }),
      body: t("limits.rateBody"),
    },
    {
      icon: LIMIT_ICONS.cache,
      title: t("limits.cacheTitle"),
      body: t("limits.cacheBody"),
    },
    {
      icon: LIMIT_ICONS.cors,
      title: t("limits.corsTitle"),
      body: t("limits.corsBody"),
    },
    {
      icon: LIMIT_ICONS.private,
      title: t("limits.privateTitle"),
      body: t("limits.privateBody"),
    },
    {
      icon: LIMIT_ICONS.scan,
      title: t("limits.scanTitle"),
      body: t("limits.scanBody"),
    },
    {
      icon: LIMIT_ICONS.selfHost,
      title: t("limits.selfHostTitle"),
      body: t("limits.selfHostBody"),
    },
  ];
  const cards = [
    {
      title: t("imageCard.title"),
      lines: [
        t("imageCard.noKey"),
        t("imageCard.static"),
        t("imageCard.formats"),
        t("imageCard.limit", { perMinute }),
      ],
      rest: false,
    },
    {
      title: t("restCard.title"),
      lines: [
        t("restCard.key"),
        t("restCard.dynamic"),
        t("restCard.analytics"),
        t("restCard.free", { count: freeDynamicCodes }),
      ],
      rest: true,
    },
  ];

  const params: { name: string; fallback: string; description: string }[] = [
    {
      name: "data",
      fallback: t("paramsRequired"),
      description: t("params.data", { max: QR_DATA_MAX_LENGTH }),
    },
    {
      name: "size",
      fallback: String(QR_DEFAULTS.size),
      description: t("params.size", { min: QR_SIZE_MIN, max: QR_SIZE_MAX }),
    },
    { name: "format", fallback: "svg", description: t("params.format") },
    {
      name: "fg, bg",
      fallback: `${QR_DEFAULTS.fg.slice(1)}, ${QR_DEFAULTS.bg.slice(1)}`,
      description: t("params.colors"),
    },
    {
      name: "body, eye, dot",
      fallback: QR_DEFAULTS.body,
      description: t("params.shapes", { count: PRODUCT_FACTS.bodyPatterns }),
    },
    {
      name: "level",
      fallback: QR_DEFAULTS.level,
      description: t("params.level"),
    },
    {
      name: "margin",
      fallback: String(QR_DEFAULTS.margin),
      description: t("params.margin", { max: QR_MARGIN_MAX }),
    },
    {
      name: "logoIcon",
      fallback: t("paramsNone"),
      description: t("params.logoIcon", { brands }),
    },
    {
      name: "frame, frameText",
      fallback: t("paramsNone"),
      description: t("params.frame"),
    },
    {
      name: "style",
      fallback: t("paramsNone"),
      description: t("params.style"),
    },
  ];

  const more = [
    {
      href: "/docs/developers/google-chart-api",
      key: "googleChart",
      icon: Repeat,
    },
    { href: "/mcp", key: "mcp", icon: MagicStar },
    { href: "/docs/developers/barcode-api", key: "barcode", icon: Barcode },
    { href: "/docs/developers/cli", key: "cli", icon: CommandSquare },
    { href: "/docs/nextjs", key: "react", icon: Code },
  ] as const satisfies readonly { href: string; key: string; icon: CardIcon }[];

  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebAPI",
          name: "QRdx QR code image API",
          description: t("metaDescription", { perMinute }),
          url: pageUrl.toString(),
          documentation: new URL(
            "/docs/developers/image-api",
            baseUrl,
          ).toString(),
          isAccessibleForFree: true,
          provider: { "@type": "Organization", name: "QRdx", url: baseUrl },
        }}
      />
      <ToolHero
        pattern="ramp"
        crumbs={[
          { name: common("home"), path: "/" },
          { name: t("crumb"), path: "/qr-code-api" },
        ]}
        title={t("title")}
        intro={[t("intro1"), t("intro2")]}
      >
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <ul className="contents">
            {facts.map((fact) => (
              <li key={fact} className="inline-flex items-center gap-1.5">
                <TickCircle aria-hidden className="size-3.5" />
                {fact}
              </li>
            ))}
          </ul>
          {(
            [
              ["/docs/developers/image-api", t("docs")],
              ["/docs/developers/rest-api", t("restDocs")],
            ] as const
          ).map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-1 font-medium text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {label}
              <ArrowRight2 aria-hidden className="size-3.5" />
            </Link>
          ))}
        </div>
      </ToolHero>

      <section
        aria-labelledby="builder"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="builder"
          eyebrow={t("builderEyebrow")}
          title={t("builderTitle")}
          description={t("builderDescription")}
        />
        <ClientMessages namespaces={["qrCodeApi.builder", "codeSnippet"]}>
          <UrlBuilder
            apiBase={API}
            previewBase="/api/v1"
            formats={qrImageFormats}
            bodies={BODY_PATTERN}
            logoIcons={LOGO_ICON_IDS}
            sizeMin={QR_SIZE_MIN}
            sizeMax={QR_SIZE_MAX}
            dataMax={QR_DATA_MAX_LENGTH}
            perMinute={perMinute}
            initial={{
              ...API_DEFAULTS,
              data: CANONICAL_ORIGIN,
              logoIcon: "none",
            }}
          />
        </ClientMessages>
      </section>

      <section
        aria-labelledby="examples"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="examples"
          eyebrow={t("examplesEyebrow")}
          title={t("examplesTitle")}
          description={t("examplesDescription")}
        />
        <ClientMessages namespaces={["codeSnippet"]}>
          <div className="grid gap-4 lg:grid-cols-2">
            {(["markdown", "html", "curl", "js"] as const).map((key) => (
              <CodeSnippet
                key={key}
                code={EXAMPLES[key]}
                label={t(`examples.${key}`)}
                wrap={key === "markdown"}
              />
            ))}
          </div>
        </ClientMessages>
      </section>

      <section
        aria-labelledby="parameters"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="parameters"
          eyebrow={t("paramsEyebrow")}
          title={t("paramsTitle")}
          description={t.rich("paramsDescription", {
            link: (chunks) => (
              <Link
                href="/docs/developers/image-api#parameters"
                className={textLinkClass}
              >
                {chunks}
              </Link>
            ),
          })}
        />
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("paramsHeader.name")}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("paramsHeader.default")}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("paramsHeader.description")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {params.map((param) => (
                <tr key={param.name} className="align-top">
                  <th
                    scope="row"
                    className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium text-foreground"
                  >
                    {param.name}
                  </th>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                    {param.fallback}
                  </td>
                  <td className="px-4 py-3 leading-relaxed text-muted-foreground text-pretty">
                    {param.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="limits"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="limits"
          eyebrow={t("limitsEyebrow")}
          title={t("limitsTitle")}
        />
        <CardGrid count={limits.length}>
          {limits.map(({ icon, title, body }) => (
            <Card key={title} className="h-full gap-3 p-5">
              <IconTile icon={icon} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <h3 className="font-medium text-foreground">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                  {body}
                </p>
              </div>
            </Card>
          ))}
        </CardGrid>
      </section>

      <section
        aria-labelledby="rest"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="rest"
          eyebrow={t("restEyebrow")}
          title={t("restTitle")}
          description={t("restDescription")}
        />
        <div className="grid gap-3 md:grid-cols-2">
          {cards.map((card) => (
            <Card key={card.title} className="h-full gap-4 p-5">
              <h3 className="font-medium text-foreground">{card.title}</h3>
              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                {card.lines.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <TickCircle
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-foreground/70"
                    />
                    {line}
                  </li>
                ))}
              </ul>
              {card.rest && (
                <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <Link
                    href="/docs/developers/rest-api"
                    className={textLinkClass}
                  >
                    {t("restLink")}
                  </Link>
                  <Link
                    href="/docs/developers/quickstart"
                    className={textLinkClass}
                  >
                    {t("quickstartLink")}
                  </Link>
                </div>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="more"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading id="more" title={t("moreTitle")} />
        <CardGrid count={more.length}>
          {more.map(({ href, key, icon }) => (
            <LinkCard
              key={key}
              href={href}
              icon={icon}
              title={t(`more.${key}Title`)}
              description={t(`more.${key}Body`)}
            />
          ))}
        </CardGrid>
      </section>

      <FaqList title={t("faqTitle")} faqs={faqs} />
    </main>
  );
}
