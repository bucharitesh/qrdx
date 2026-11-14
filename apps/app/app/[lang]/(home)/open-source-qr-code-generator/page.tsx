import { GithubLogo } from "@repo/design-system/components/icons";
import { JsonLd } from "@repo/design-system/components/seo/json-ld";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { localizeHref } from "@repo/i18n/paths";
import {
  ArrangeHorizontal,
  ArrowRight2,
  Book1,
  Code1,
  Driver,
  Edit2,
  Global,
  MessageProgramming,
  ShieldTick,
  TickCircle,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
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
import { siteConfig } from "@/config/site";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { baseUrl } from "@/lib/metadata";
import { getPlanLimits } from "@/lib/plans";
import { organizationId } from "@/lib/seo-schema";

// /open-source-qr-code-generator: the landing page for "open source QR code
// generator", "self-hosted QR code generator" and "QR code generator
// GitHub". It explains what's open and under which license, and links the
// self-hosting guide (/docs/self-hosting) for the steps instead of repeating
// them. Sources:
// - licenses: LICENSING.md, LICENSE, the LICENSE files in packages/qrdx,
//   packages/cli and plugins/*, the LICENSE.md files in the ee/ folders, and
//   the README's License section (MIT from qrdx 0.0.47 and @qrdx/cli 0.0.5)
// - self-hosting: apps/docs/content/docs/self-hosting.mdx and the README; the Free
//   limits without payments: apps/docs/content/docs/plans-and-limits.mdx
// - the name and logo: TRADEMARK.md; contributing: CONTRIBUTING.md
// - the shutdown promise: the Never-Hostage Guarantee (/guarantee)

const PATH = "/open-source-qr-code-generator";

const REPO = siteConfig.links.github;
const blob = (file: string) => `${REPO}/blob/main/${file}`;

const FREE = getPlanLimits("free");

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "openSource" });
  return localizedMetadata({
    locale,
    path: PATH,
    title: t("metaTitle"),
    description: t("metaDescription"),
    ownOgImage: true,
  });
}

const PARTS = [
  {
    key: "app",
    folder: "apps/app",
    license: "AGPL-3.0-or-later",
    href: blob("LICENSE"),
  },
  {
    key: "library",
    folder: "packages/qrdx",
    license: "MIT",
    href: blob("packages/qrdx/LICENSE"),
  },
  {
    key: "cli",
    folder: "packages/cli",
    license: "MIT",
    href: blob("packages/cli/LICENSE"),
  },
  {
    key: "plugins",
    folder: "plugins/*",
    license: "MIT",
    href: `${REPO}/tree/main/plugins`,
  },
  {
    key: "ee",
    folder: "apps/app/ee, packages/auth/ee",
    license: null,
    href: blob("apps/app/ee/LICENSE.md"),
  },
] as const;

const DOCKER = [
  `git clone ${REPO}.git && cd qrdx`,
  "cp .env.example .env   # set BETTER_AUTH_SECRET and a sign-in method",
  "docker compose up -d --build",
].join("\n");

const LIBRARY = [
  "# React components",
  "npm install qrdx",
  "",
  "# A QR code from a terminal or CI",
  'npx @qrdx/cli generate "https://example.com" -o qr.svg',
].join("\n");

export default async function OpenSourcePage() {
  const locale = await requireLocale();
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "openSource" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const pageUrl = new URL(localizeHref(PATH, locale), baseUrl).toString();
  const values = { count: FREE.dynamicCodes, pages: FREE.landingPages };

  const facts = [
    t("facts.agpl"),
    t("facts.mit"),
    t("facts.selfHost"),
    t("facts.noAccount"),
  ];

  const ways = [
    {
      key: "hosted",
      icon: Global,
      links: [
        { href: "/playground", label: t("ways.hostedLink") },
        { href: "/pricing", label: t("ways.hostedLink2") },
      ],
    },
    {
      key: "selfHost",
      icon: Driver,
      links: [{ href: "/docs/self-hosting", label: t("ways.selfHostLink") }],
    },
    {
      key: "library",
      icon: Code1,
      links: [
        { href: "/docs/getting-started", label: t("ways.libraryLink") },
        { href: "/docs/developers/cli", label: t("ways.libraryLink2") },
      ],
    },
  ] as const;

  const licenses = [
    { key: "agpl", href: blob("LICENSE") },
    { key: "mit", href: blob("packages/qrdx/LICENSE") },
    { key: "trademark", href: blob("TRADEMARK.md") },
  ] as const;

  const contributeLinks = [
    { key: "contributing", href: blob("CONTRIBUTING.md") },
    {
      key: "goodFirst",
      href: `${REPO}/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22`,
    },
    { key: "discussions", href: `${REPO}/discussions/categories/q-a` },
    { key: "security", href: blob("SECURITY.md") },
  ] as const;

  const more = [
    { href: "/dynamic-qr-code", key: "dynamic", icon: Edit2 },
    { href: "/qr-code-api", key: "api", icon: Code1 },
    { href: "/mcp", key: "mcp", icon: MessageProgramming },
    { href: "/compare", key: "compare", icon: ArrangeHorizontal },
    { href: "/guarantee", key: "guarantee", icon: ShieldTick },
  ] as const satisfies readonly { href: string; key: string; icon: CardIcon }[];

  const faqs = (
    [
      "open",
      "github",
      "free",
      "need",
      "closed",
      "changes",
      "name",
      "shutdown",
    ] as const
  ).map((key) => ({
    question: t(`faq.${key}Question`),
    answer: t(`faq.${key}Answer`),
  }));

  const externalLink = (href: string, label: ReactNode) => (
    <a
      href={href}
      className={textLinkClass}
      rel="noopener noreferrer"
      target="_blank"
    >
      {label}
    </a>
  );

  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareSourceCode",
          name: "QRdx",
          description: t("metaDescription"),
          url: pageUrl,
          codeRepository: REPO,
          license: "https://www.gnu.org/licenses/agpl-3.0.html",
          programmingLanguage: "TypeScript",
          runtimePlatform: "Node.js 22",
          isAccessibleForFree: true,
          author: { "@id": organizationId },
          publisher: { "@id": organizationId },
        }}
      />
      <ToolHero
        pattern="topo"
        crumbs={[
          { name: common("home"), path: "/" },
          { name: t("crumb"), path: PATH },
        ]}
        title={t("title")}
        intro={[t("intro1"), t("intro2")]}
      >
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Button asChild>
            <a href={REPO} rel="noopener" target="_blank">
              <GithubLogo aria-hidden className="size-4" />
              {t("githubCta")}
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href="/docs/self-hosting">
              <Book1 aria-hidden className="size-4" />
              {t("selfHostCta")}
            </Link>
          </Button>
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          {facts.map((fact) => (
            <li key={fact} className="inline-flex items-center gap-1.5">
              <TickCircle aria-hidden className="size-3.5" />
              {fact}
            </li>
          ))}
        </ul>
      </ToolHero>

      <section
        aria-labelledby="parts"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="parts"
          eyebrow={t("partsEyebrow")}
          title={t("partsTitle")}
          description={t.rich("partsDescription", {
            link: (chunks) => externalLink(blob("LICENSING.md"), chunks),
          })}
        />
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-left text-sm md:min-w-[40rem]">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("partsHeader.part")}
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-2.5 font-medium md:table-cell"
                >
                  {t("partsHeader.folder")}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("partsHeader.license")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {PARTS.map((part) => (
                <tr key={part.key} className="align-top">
                  <th scope="row" className="px-4 py-3 font-normal">
                    <span className="block font-medium text-foreground">
                      {t(`parts.${part.key}Name`)}
                    </span>
                    <span className="mt-0.5 block leading-relaxed text-muted-foreground text-pretty">
                      {t(`parts.${part.key}Body`)}
                    </span>
                    {/* Phones drop the folder column; it shows here. */}
                    <span className="mt-1 block font-mono text-xs text-muted-foreground md:hidden">
                      {part.folder}
                    </span>
                  </th>
                  <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground md:table-cell">
                    {part.folder}
                  </td>
                  <td className="px-4 py-3 md:whitespace-nowrap">
                    {externalLink(part.href, part.license ?? t("eeLicense"))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground text-pretty">
          {t("eeNote")}
        </p>
      </section>

      <section
        aria-labelledby="ways"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="ways"
          eyebrow={t("waysEyebrow")}
          title={t("waysTitle")}
        />
        <CardGrid count={ways.length}>
          {ways.map((way) => (
            <Card key={way.key} className="h-full gap-3 p-5">
              <IconTile icon={way.icon} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <h3 className="font-medium text-foreground">
                  {t(`ways.${way.key}Title`)}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                  {t(`ways.${way.key}Body`, values)}
                </p>
              </div>
              <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {way.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={textLinkClass}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </Card>
          ))}
        </CardGrid>
      </section>

      <section
        aria-labelledby="run"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="run"
          eyebrow={t("runEyebrow")}
          title={t("runTitle")}
          description={t("runDescription")}
        />
        <ClientMessages namespaces={["codeSnippet"]}>
          <div className="grid gap-4 lg:grid-cols-2">
            <CodeSnippet code={DOCKER} label={t("runLabels.docker")} />
            <CodeSnippet code={LIBRARY} label={t("runLabels.library")} />
          </div>
        </ClientMessages>
        <ul className="flex max-w-3xl flex-col gap-2 text-sm text-muted-foreground">
          {(["signIn", "postgres", "limits"] as const).map((note) => (
            <li key={note} className="flex items-start gap-2">
              <TickCircle
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-foreground/70"
              />
              <span className="text-pretty">{t(`runNotes.${note}`)}</span>
            </li>
          ))}
        </ul>
        <Link
          href="/docs/self-hosting"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
        >
          {t("runLink")}
          <ArrowRight2 aria-hidden className="size-3.5" />
        </Link>
      </section>

      <section
        aria-labelledby="licenses"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="licenses"
          eyebrow={t("licenseEyebrow")}
          title={t("licenseTitle")}
        />
        <CardGrid count={licenses.length}>
          {licenses.map((license) => (
            <Card key={license.key} className="h-full gap-2 p-5">
              <h3 className="font-medium text-foreground">
                {t(`licenses.${license.key}Title`)}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                {license.key === "trademark"
                  ? t.rich("licenses.trademarkBody", {
                      link: (chunks) => externalLink(license.href, chunks),
                    })
                  : t(`licenses.${license.key}Body`)}
              </p>
            </Card>
          ))}
        </CardGrid>
        <p className="text-sm text-muted-foreground">{t("licenseNote")}</p>
      </section>

      <section
        aria-labelledby="contribute"
        className="grid w-full gap-8 px-10 py-12 md:py-16 lg:grid-cols-2 lg:gap-12"
      >
        <div className="flex flex-col gap-4">
          <SectionHeading
            id="contribute"
            eyebrow={t("contributeEyebrow")}
            title={t("contributeTitle")}
            description={t("contributeBody")}
          />
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {contributeLinks.map((link) => (
              <li key={link.key}>
                {externalLink(link.href, t(`contributeLinks.${link.key}`))}
              </li>
            ))}
          </ul>
        </div>
        <Card className="h-full gap-2 p-5">
          <h3 className="font-medium text-foreground">{t("stackTitle")}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {t("stackBody")}
          </p>
        </Card>
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
