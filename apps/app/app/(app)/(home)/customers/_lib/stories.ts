import type { InferPageType } from "fumadocs-core/source";
import { customersSource } from "@/lib/content-source";
import { type Customer, getPublishedCustomers } from "@/lib/customers";

export type CustomerStoryPage = InferPageType<typeof customersSource>;

export interface CustomerStory {
  customer: Customer;
  page: CustomerStoryPage;
}

/**
 * Each published customer (lib/customers.ts) with its story, in that
 * file's order. customersSource holds published stories only, so an
 * unpublished customer has no page here either.
 */
export function getCustomerStories(): CustomerStory[] {
  return getPublishedCustomers().flatMap((customer) => {
    const page = customersSource.getPage([customer.id]);
    return page ? [{ customer, page }] : [];
  });
}

/** One published customer's story, by its slug (the customer's id). */
export function getCustomerStory(slug: string): CustomerStory | undefined {
  return getCustomerStories().find(({ customer }) => customer.id === slug);
}
