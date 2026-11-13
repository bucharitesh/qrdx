import type { ComponentType } from "react";
import { FlamLogo } from "@/components/customers/flam-logo";
import type { CustomerLogoProps } from "@/components/customers/logo-props";

// Companies that use QRdx: the home page's "Used by" row and their stories on
// the blog. Real companies only, each listed with its approval. To add one,
// add an entry here, its logo (real artwork, filling with currentColor) in
// components/customers, and its line in messages/en.json
// (home.customers.lines.<id>).

export type CustomerId = "flam";

export interface Customer {
  id: CustomerId;
  name: string;
  /** Inline SVG of the company's own logo. */
  logo: ComponentType<CustomerLogoProps>;
  /** The customer story's slug: content/blog/<storySlug>.mdx. */
  storySlug: string;
  /**
   * The switch for this customer. While it's false the story is out of the
   * blog everywhere (its page, the lists, RSS, the sitemap, llms.txt, Open
   * Graph images: lib/content-source.ts drops it) and the home page doesn't
   * show the company. Set it to true once the company has approved the story.
   */
  published: boolean;
}

export const CUSTOMERS: readonly Customer[] = [
  {
    id: "flam",
    name: "Flam",
    logo: FlamLogo,
    storySlug: "flam-branded-qr-codes",
    published: true,
  },
];

export const customerStoryHref = (customer: Customer): string =>
  `/blog/${customer.storySlug}`;

/** The customers the home page shows: those whose story is published. */
export function getPublishedCustomers(
  customers: readonly Customer[] = CUSTOMERS,
): Customer[] {
  return customers.filter((customer) => customer.published);
}

/**
 * True for a blog post that is a customer story not yet approved, by its
 * file path in content/blog ("flam-branded-qr-codes.mdx") or its slug.
 */
export function isHiddenCustomerStory(
  pathOrSlug: string,
  customers: readonly Customer[] = CUSTOMERS,
): boolean {
  const slug = pathOrSlug.replace(/\.mdx?$/, "");
  return customers.some(
    (customer) => customer.storySlug === slug && !customer.published,
  );
}
