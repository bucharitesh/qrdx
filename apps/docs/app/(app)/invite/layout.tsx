import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header } from "@/components/header";
import { AppMessages } from "@/components/i18n/app-messages";
import { ACCOUNT_FLOW_NAMESPACES } from "@/lib/i18n/playground";

export const metadata: Metadata = {
  title: "Team invitation",
  robots: { index: false, follow: false },
};

export default function InviteLayout({ children }: { children: ReactNode }) {
  return (
    <AppMessages namespaces={ACCOUNT_FLOW_NAMESPACES}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 items-start justify-center px-4 py-12 md:py-20">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </AppMessages>
  );
}
