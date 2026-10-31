"use server";

import { env } from "@/lib/env";
import { baseUrl } from "@/lib/metadata";
import {
  BILLING_NOT_CONFIGURED_MESSAGE,
  isBillingConfigured,
  polar,
} from "@/lib/polar";
import { getCurrentUser, logError } from "@/lib/shared";
import { getOrCreateCustomer } from "./customer";

export const createCheckout = async (productId: string) => {
  const hasProducts = Boolean(
    env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID ||
      env.NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID,
  );

  if (!(isBillingConfigured && hasProducts && productId)) {
    return { error: BILLING_NOT_CONFIGURED_MESSAGE };
  }

  try {
    const user = await getCurrentUser();
    const customer = await getOrCreateCustomer(user);

    console.log("customer", user, customer);

    const checkout = await polar.checkouts.create({
      products: [productId as string],
      customerId: customer?.id,
      successUrl: `${baseUrl.origin}/success?checkout_id={CHECKOUT_ID}`,
    });

    return { url: checkout.url };
  } catch (error) {
    logError(error as Error, { action: "createCheckout" });
    return { error: "Failed to create checkout" };
  }
};
