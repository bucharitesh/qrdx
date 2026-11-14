import { Badge } from "@repo/design-system/components/ui/badge";
import Link from "fumadocs-core/link";
import { ArrowRight2, Code, ExportSquare } from "iconsax-reactjs";
import { getLocale } from "next-intl/server";
import { localizeHref } from "@/lib/i18n/paths";
import { REGISTRY_URL } from "./registry-data";

/** Small links under a component page title, in the docs' language. */
export async function ComponentLinks({ name }: { name: string }) {
  const locale = await getLocale();
  return (
    <div className="not-prose flex flex-wrap items-center gap-2">
      <Badge asChild variant="outline">
        <Link href={localizeHref("/docs/api-reference", locale)}>
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
