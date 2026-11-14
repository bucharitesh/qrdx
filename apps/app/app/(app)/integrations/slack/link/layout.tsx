import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Link your Slack account",
  robots: { index: false, follow: false },
  // The token is in the URL: never send it on to another site.
  referrer: "no-referrer",
};

export default function SlackLinkLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 items-start justify-center px-4 py-12 md:py-20">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
