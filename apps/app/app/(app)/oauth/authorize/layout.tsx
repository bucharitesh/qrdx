import type { ReactNode } from "react";
import { AppMessages } from "@/components/i18n/app-messages";
import { ACCOUNT_FLOW_NAMESPACES } from "@/lib/i18n/playground";

// The consent screen in the person's language (lib/i18n/app-locale.ts).
export default function AuthorizeLayout({ children }: { children: ReactNode }) {
  return (
    <AppMessages namespaces={ACCOUNT_FLOW_NAMESPACES}>{children}</AppMessages>
  );
}
