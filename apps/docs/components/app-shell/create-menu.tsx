"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  Add,
  ArrowDown2,
  Brush2,
  DocumentText1,
  DocumentUpload,
  ScanBarcode,
  TaskSquare,
} from "iconsax-reactjs";
import Link from "next/link";
import { useWorkspaceHref } from "@/components/workspace-provider";
import { useCreate } from "./create-actions";

/**
 * The app's one "make something" entry point, on every app page: a split
 * button. The main half starts a dynamic code; the arrow lists the rest.
 */
export function CreateMenu() {
  const create = useCreate();
  const href = useWorkspaceHref();

  return (
    <div className="bg-background flex h-8 items-center rounded-full border shadow-xs">
      <Button
        aria-label="New dynamic QR code"
        className="h-full gap-1.5 rounded-l-full rounded-r-none border-0 pr-1.5 pl-2.5 shadow-none sm:pr-2 sm:pl-3"
        onClick={() => create("code")}
        variant="ghost"
      >
        <Add aria-hidden className="size-4" />
        <span className="hidden sm:inline">New code</span>
      </Button>
      <span aria-hidden className="bg-border h-4 w-px" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="More to create"
            className="h-full w-7 rounded-l-none rounded-r-full border-0 px-0 shadow-none sm:w-8"
            variant="ghost"
          >
            <ArrowDown2 aria-hidden className="size-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => create("code")}>
            <ScanBarcode aria-hidden />
            Dynamic QR code
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => create("page")}>
            <DocumentText1 aria-hidden />
            Landing page
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => create("form")}>
            <TaskSquare aria-hidden />
            Form
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={href("/codes/import")}>
              <DocumentUpload aria-hidden />
              Import codes
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/playground">
              <Brush2 aria-hidden />
              Open the editor
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
