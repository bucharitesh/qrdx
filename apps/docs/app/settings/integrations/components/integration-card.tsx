import { Badge } from "@repo/design-system/components/ui/badge";
import { cn } from "@repo/design-system/lib/utils";
import { getCapabilityLabel } from "@repo/integration-kit";
import type {
  IntegrationCapability,
  IntegrationLogoSet,
} from "@repo/integrations";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

interface IntegrationCardProps {
  slug: string;
  name: string;
  description: string;
  logos: IntegrationLogoSet;
  capabilities: IntegrationCapability[];
  isConnected: boolean;
  isConfigured?: boolean;
}

export function IntegrationCard({
  slug,
  name,
  description,
  logos,
  capabilities,
  isConnected,
  isConfigured = true,
}: IntegrationCardProps) {
  return (
    <Link
      href={`/settings/integrations/${slug}`}
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-sm",
      )}
    >
      {/* Status badges */}
      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        {isConnected && (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
            Enabled
          </span>
        )}
        {!isConfigured && (
          <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-400">
            Coming Soon
          </span>
        )}
      </div>

      {/* Logo */}
      <div className="border border-border flex size-10 items-center justify-center rounded-lg bg-background p-2 shrink-0">
        {logos.light ? (
          <>
            <img
              src={logos.light}
              alt={`${name} logo`}
              className="size-full object-contain dark:hidden"
            />
            <img
              src={logos.dark}
              alt={`${name} logo`}
              className="hidden size-full object-contain dark:block"
            />
          </>
        ) : (
          <ExternalLink className="size-4 text-muted-foreground" />
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1 pr-16">
        <span className="text-sm font-semibold leading-tight">{name}</span>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {description}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {capabilities.slice(0, 2).map((capability) => (
            <Badge
              key={capability.id}
              variant="secondary"
              className="px-1.5 py-0 text-[10px]"
            >
              {getCapabilityLabel(capability.kind)}
            </Badge>
          ))}
        </div>
      </div>
    </Link>
  );
}
