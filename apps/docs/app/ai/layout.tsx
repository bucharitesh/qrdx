import type { ReactNode } from "react";
import { Header } from "@/components/header";

export default function AILayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-muted/30">
      <Header />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
