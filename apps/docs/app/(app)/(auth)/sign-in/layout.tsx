import type { ReactNode } from "react";
import { AppMessages } from "@/components/i18n/app-messages";
import { SIGN_IN_NAMESPACES } from "@/lib/i18n/playground";

// Signed out: the language the site was in (the language menu's cookie).
export default function Layout({ children }: { children: ReactNode }) {
  return <AppMessages namespaces={SIGN_IN_NAMESPACES}>{children}</AppMessages>;
}
