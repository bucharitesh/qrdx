"use client";

import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { useWorkspaceHref } from "@/components/workspace-provider";

/** A code, page or webhook that isn't in this workspace (or no longer exists). */
export default function WorkspacePageNotFound() {
  const href = useWorkspaceHref();
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-xl font-semibold tracking-tight">
        This page could not be found
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        It may have been deleted, or it belongs to another workspace.
      </p>
      <Button asChild variant="outline">
        <Link href={href()}>Back to Home</Link>
      </Button>
    </div>
  );
}
