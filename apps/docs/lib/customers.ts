import type { ComponentType } from "react";
import { FlamLogo } from "@/components/customers/flam-logo";
import type { CustomerLogoProps } from "@/components/customers/logo-props";

// Companies that use QRdx: the /customers section and the home page's "Used
// by" row. Real companies only, each listed with its approval. To add one,
// add an entry here, its story as content/customers/<id>.mdx, its logo (real
// artwork, filling with currentColor) in components/customers, and its line
// in messages/en.json (home.customers.lines.<id>).

export type CustomerId = "flam";

export interface Customer {
  /** Also the story's slug: content/customers/<id>.mdx, at /customers/<id>. */
  id: CustomerId;
  name: string;
  /** Inline SVG of the company's own logo. */
  logo: ComponentType<CustomerLogoProps>;
  /**
   * The switch for this customer. While it's false the company is nowhere
   * on the site: no story page, no card on /customers, no link on the home
   * page, nothing in the sitemap, llms.txt or Open Graph images
   * (lib/content-source.ts drops the story). Set it to true once the
   * company has approved its story.
   */
  published: boolean;
}

export const CUSTOMERS: readonly Customer[] = [
  {
    id: "flam",
    name: "Flam",
    logo: FlamLogo,
    published: true,
  },
];

export const CUSTOMERS_PATH = "/customers";

export const customerStoryHref = (customer: Customer): string =>
  `${CUSTOMERS_PATH}/${customer.id}`;

/** The customers the site shows: those whose story is published. */
export function getPublishedCustomers(
  customers: readonly Customer[] = CUSTOMERS,
): Customer[] {
  return customers.filter((customer) => customer.published);
}

/**
 * True for a story in content/customers, by its file path ("flam.mdx") or
 * slug, whose customer is listed here and published. Anything else (an
 * unpublished customer, a file with no customer) stays off the site.
 */
export function isPublishedCustomerStory(
  pathOrSlug: string,
  customers: readonly Customer[] = CUSTOMERS,
): boolean {
  const slug = pathOrSlug.replace(/\.mdx?$/, "");
  return getPublishedCustomers(customers).some(
    (customer) => customer.id === slug,
  );
}
