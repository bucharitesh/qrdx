import { Badge } from "@repo/design-system/components/ui/badge";
import Link from "fumadocs-core/link";
import { ArrowRight2, Code, ExportSquare } from "iconsax-reactjs";
import { REGISTRY_URL } from "./registry-data";

/** Small links under a component page title, like shadcn/ui's docs. */
export function ComponentLinks({ name }: { name: string }) {
  return (
    <div className="not-prose flex flex-wrap items-center gap-2">
      <Badge asChild variant="outline">
        <Link href="/docs/api-reference">
          qrdx library
          <ArrowRight2 aria-hidden="true" />
        </Link>
      </Badge>
      <Badge asChild variant="outline">
        <Link href="#api-reference">
          API reference
          <ArrowRight2 aria-hidden="true" />
        </Link>
      </Badge>
      <Badge asChild variant="outline">
        <a href={`${REGISTRY_URL}/${name}.json`} rel="noopener" target="_blank">
          <Code aria-hidden="true" />
          {name}.json
          <ExportSquare aria-hidden="true" />
        </a>
      </Badge>
    </div>
  );
}
