"use client";

import { track } from "@repo/analytics";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Diamonds } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { useSubscription } from "@/lib/hooks/use-subscription";

interface GetProCTAProps extends React.ComponentProps<typeof Button> {}

export function GetProCTA({ className, ...props }: GetProCTAProps) {
  const t = useTranslations("nav.getProCta");
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
      <Link
        href="/pricing"
        onClick={() => track("upgrade_clicked", { source: "header" })}
      >
        <Diamonds className="h-4 w-4" />
        {t("getPro")}
      </Link>
    </Button>
  );
}
