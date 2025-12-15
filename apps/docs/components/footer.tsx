import { ModeToggle } from "@repo/design-system/components/mode-toggle";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 p-6 text-sm sm:flex-row">
        <div className="flex flex-wrap items-center justify-center gap-4 text-muted-foreground">
          <span>© 2025 Bucha Ritesh</span>
          <span className="hidden sm:inline">·</span>
          <Link
            href="/legal/privacy-policy"
            className="hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
          <span className="hidden sm:inline">·</span>
          <Link
            href="/legal/terms-of-service"
            className="hover:text-foreground transition-colors"
          >
            Terms of Service
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle />
        </div>
      </div>
    </footer>
  );
}
