import "server-only";

import type { Customer } from "@polar-sh/sdk/models/components/customer.js";
import type { user } from "@repo/database/schema";
import { polar } from "@/lib/polar";
import { logError } from "@/lib/shared";

export const getOrCreateCustomer = async (
  userRecord: typeof user.$inferSelect,
) => {
  let customer: Customer | null = null;

  try {
    customer = await polar.customers.getExternal({
      externalId: userRecord.id,
    });
  } catch (_e) {
    customer = null;
  }

  if (customer) return customer;

  try {
    const newCustomer = await polar.customers.create({
      email: userRecord.email,
      externalId: userRecord.id,
      name: userRecord.name,
    });

    return newCustomer;
  } catch (err) {
    logError(err as Error, { action: "createCustomer", user: userRecord });
  }

  return null;
};
