import "server-only";

import type { models } from "@polar-sh/sdk/2026-10";
import type { user } from "@repo/database/schema";
import { polar } from "@/lib/polar";
import { logError } from "@/lib/shared";

export const getOrCreateCustomer = async (
  userRecord: typeof user.$inferSelect,
) => {
  let customer: models.Customer | null = null;

  try {
    customer = await polar.customers.getExternal(userRecord.id);
  } catch (_e) {
    customer = null;
  }

  if (customer) return customer;

  try {
    const newCustomer = await polar.customers.create({
      email: userRecord.email,
      external_id: userRecord.id,
      name: userRecord.name,
    });

    return newCustomer;
  } catch (err) {
    logError(err as Error, { action: "createCustomer", user: userRecord });
  }

  return null;
};
