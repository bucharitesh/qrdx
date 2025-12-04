"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Gem } from "lucide-react";
import Link from "next/link";
import { useSubscription } from "@/lib/hooks/use-subscription";

interface GetProCTAProps extends React.ComponentProps<typeof Button> {}

export function GetProCTA({ className, ...props }: GetProCTAProps) {
  const { subscriptionStatus, isPending } = useSubscription();
  const isPro = subscriptionStatus?.isSubscribed ?? false;

  if (isPending || isPro) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      className={cn(
        "text-primary animate-in fade-in-50 bg-primary/10 hover:bg-primary hover:text-primary-foreground shadow-none duration-300",
        className,
      )}
      asChild
      {...props}
    >
      <Link href="/pricing">
        <Gem className="h-4 w-4" />
        Get Pro
      </Link>
    </Button>
  );
}
