import "server-only";

import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { isEmailConfigured } from "@/lib/email/send";
import { canDeliverSignInCodes } from "./deletion";

/** True when this deployment can get a sign-in code to the user. */
export function signInCodesAvailable(): boolean {
  return canDeliverSignInCodes({
    nodeEnv: process.env.NODE_ENV,
    deliveryAllowed: isOutboundDeliveryAllowed(),
    emailConfigured: isEmailConfigured,
  });
}
