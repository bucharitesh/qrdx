import { notFound } from "next/navigation";
import SsoSettingsPage from "@/ee/sso/settings-page";
import { isFeatureAvailable } from "@/lib/feature-availability";

export { metadata } from "@/ee/sso/settings-page";

/**
 * Settings → Single sign-on (ee/sso, QRdx commercial licence). Not found on
 * servers without a licence key, where SSO isn't registered at all.
 */
export default function Page() {
  if (!isFeatureAvailable("sso")) notFound();
  return <SsoSettingsPage />;
}
