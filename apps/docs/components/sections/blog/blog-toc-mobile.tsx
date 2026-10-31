import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

interface TocItem {
  title: ReactNode;
  url: string;
  depth: number;
}

export function BlogTocMobile({ items }: { items: TocItem[] }) {
  return (
    <details className="group border-b border-border lg:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-12 [&::-webkit-details-marker]:hidden">
        On this page
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <nav aria-label="Table of contents" className="px-5 pb-4 sm:px-12">
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.url}>
              <a
                href={item.url}
                className="block py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                style={{ paddingLeft: `${Math.max(0, item.depth - 2) * 12}px` }}
              >
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
