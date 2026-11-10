import { Button } from "@repo/design-system/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Workspace not found",
  robots: { index: false, follow: false },
};

/** A workspace URL that doesn't exist or that you can't open (both alike). */
export default function WorkspaceNotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Workspace not found
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        It may not exist, or you may not have access to it.
      </p>
      <Button asChild>
        <Link href="/dashboard">Go to your dashboard</Link>
      </Button>
    </main>
  );
}
