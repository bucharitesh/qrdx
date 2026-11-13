import { useTranslations } from "next-intl";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import {
  type Customer,
  customerStoryHref,
  getPublishedCustomers,
} from "@/lib/customers";

// "Used by" on the home page: the companies in lib/customers.ts whose story
// is published, each as its own logo and one line linking to the story.
// With none published it renders nothing, so the page has no empty band.

function CustomerStoryLink({ customer }: { customer: Customer }) {
  const t = useTranslations("home.customers");
  const Logo = customer.logo;
  return (
    <Link
      href={customerStoryHref(customer)}
      className="group flex flex-col items-center gap-3 rounded-lg px-3 py-2 text-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:flex-row sm:gap-5 sm:text-left"
    >
      <Logo
        title={customer.name}
        className="h-7 w-auto shrink-0 text-foreground/80 transition-colors group-hover:text-foreground motion-reduce:transition-none md:h-8"
      />
      <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />
      <span className="text-balance text-sm text-muted-foreground">
        {t(`lines.${customer.id}`)}{" "}
        <span className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors group-hover:decoration-foreground motion-reduce:transition-none">
          {t("readStory")}
        </span>
      </span>
    </Link>
  );
}

export function UsedBySection({
  customers = getPublishedCustomers(),
}: {
  customers?: Customer[];
}) {
  const t = useTranslations("home.customers");
  if (customers.length === 0) return null;
  return (
    <section
      id="customers"
      aria-labelledby="customers-heading"
      className="flex w-full flex-col items-center gap-4 px-6 py-8 md:py-10"
    >
      <h2
        id="customers-heading"
        className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
      >
        {t("eyebrow")}
      </h2>
      <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2">
        {customers.map((customer) => (
          <li key={customer.id}>
            <CustomerStoryLink customer={customer} />
          </li>
        ))}
      </ul>
    </section>
  );
}
