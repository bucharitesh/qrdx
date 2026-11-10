import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Team invitation",
  robots: { index: false, follow: false },
};

export default function InviteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 items-start justify-center px-4 py-12 md:py-20">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
