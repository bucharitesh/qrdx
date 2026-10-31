import { Badge } from "@repo/design-system/components/ui/badge";
import { cn } from "@repo/design-system/lib/utils";
import { getCapabilityLabel } from "@repo/integration-kit";
import type {
  IntegrationCapability,
  IntegrationLogoSet,
} from "@repo/integrations";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { PRESSABLE } from "@/components/mockups/motion";
import {
  IntegrationLogo,
  logoForIntegration,
} from "@/components/sections/integrations/integration-logo";

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
        "group relative flex h-full flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs hover:border-foreground/15 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:shadow-none",
        PRESSABLE,
      )}
    >
      {/* Status badges */}
      <div className="absolute top-5 right-5 flex items-center gap-1.5">
        {isConnected && (
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          >
            Connected
          </Badge>
        )}
        {!isConfigured && (
          <Badge
            variant="outline"
            className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          >
            Not configured
          </Badge>
        )}
      </div>

      {/* Logo */}
      <IntegrationLogo logo={logoForIntegration(slug, logos)} />

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1">
        <span className="flex items-center gap-2 font-medium leading-snug">
          {name}
          <ArrowRight
            aria-hidden
            className="size-4 text-muted-foreground transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
          />
        </span>
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        <div className="mt-auto flex flex-wrap gap-1 pt-2">
          {capabilities.slice(0, 2).map((capability) => (
            <Badge
              key={capability.id}
              variant="outline"
              className="font-normal text-muted-foreground"
            >
              {getCapabilityLabel(capability.kind)}
            </Badge>
          ))}
        </div>
      </div>
    </Link>
  );
}
