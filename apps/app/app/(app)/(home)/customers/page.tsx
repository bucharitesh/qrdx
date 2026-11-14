import { JsonLd } from "@repo/design-system/components/seo/json-ld";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SectionHeader } from "@/components/sections/section-header";
import { breadcrumbSchema } from "@/components/sections/tools/json-ld";
import { CUSTOMERS_PATH, customerStoryHref } from "@/lib/customers";
import { baseUrl, createMetadata } from "@/lib/metadata";
import { getCustomerStories } from "./_lib/stories";

const title = "Customers and case studies";
const description =
  "Case studies from companies that make their QR codes with QRdx, the open-source QR code generator and library.";

export const metadata: Metadata = createMetadata({
  title,
  description,
  path: CUSTOMERS_PATH,
  ownOgImage: true,
});

const url = (path: string): string => new URL(path, baseUrl).toString();

export default async function CustomersPage() {
  const stories = getCustomerStories();
  // English only, like the rest of this section; the line is the one the
  // home page's "Used by" row shows.
  const t = await getTranslations({
    locale: "en",
    namespace: "home.customers",
  });

  return (
    <section className="flex w-full flex-col items-center justify-center">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: title,
          description,
          url: url(CUSTOMERS_PATH),
          mainEntity: {
            "@type": "ItemList",
            itemListElement: stories.map(({ customer, page }, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: page.data.title,
              url: url(customerStoryHref(customer)),
            })),
          },
        }}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Customers", path: CUSTOMERS_PATH },
        ])}
      />
      <div className="w-full">
        <SectionHeader eyebrow="Case studies" pattern="noise">
          <h1 className="text-center text-4xl font-medium tracking-tighter md:text-5xl">
            Customers
          </h1>
          <p className="text-balance text-center font-medium text-muted-foreground">
            Companies that make their QR codes with QRdx, and what they built.
          </p>
        </SectionHeader>

        <ul className="px-6 pb-16">
          {stories.map(({ customer }) => {
            const Logo = customer.logo;
            return (
              <li key={customer.id}>
                <Link
                  href={customerStoryHref(customer)}
                  className="group flex w-full flex-col border-x border-b border-border transition-colors duration-200 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
                >
                  <div className="flex h-40 items-center justify-center border-b border-border md:h-full md:min-h-48 md:border-r md:border-b-0">
                    <Logo
                      aria-hidden
                      className="h-10 w-auto text-foreground/80 transition-colors group-hover:text-foreground motion-reduce:transition-none md:h-12"
                    />
                  </div>
                  <div className="flex flex-col justify-center gap-2 p-6 md:p-10">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground md:text-2xl">
                      {customer.name}
                    </h2>
                    <p className="text-balance text-sm text-muted-foreground md:text-base">
                      {t(`lines.${customer.id}`)}
                    </p>
                    <span className="mt-4 text-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors group-hover:decoration-foreground motion-reduce:transition-none">
                      {t("readStory")}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
