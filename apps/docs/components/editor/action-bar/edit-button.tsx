import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Edit2 } from "iconsax-reactjs";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, Suspense } from "react";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { TooltipWrapper } from "@/components/tooltip-wrapper";

interface EditButtonProps extends React.ComponentProps<typeof Button> {
  themeId: string;
}

/** Renders the theme's link with the current search params (the open tab). */
function WithSearchParams({
  themeId,
  render,
}: {
  themeId: string;
  render: (href: string) => ReactNode;
}) {
  const searchParams = useSearchParams();
  return render(`/playground/${themeId}?${searchParams}`);
}

export function EditButton({
  themeId,
  disabled,
  className,
  ...props
}: EditButtonProps) {
  const t = useTranslations("editor.actionBar.editButton");
  const pathname = usePathname();
  const isEditing = pathname.includes(themeId);

  const button = (
    <Button
      variant="ghost"
      size="sm"
      className={cn(className)}
      disabled={disabled || isEditing}
      {...props}
    >
      <Edit2 className="size-4" />
      <span className="hidden text-sm md:block">{t("edit")}</span>
    </Button>
  );

  const link = (href: string) => (
    <TooltipWrapper label={t("editTheme")} asChild>
      <Link href={href}>{button}</Link>
    </TooltipWrapper>
  );

  // useSearchParams() on a prerendered page falls back to the browser up to
  // the nearest Suspense boundary: this one, so only the link waits for it.
  return (
    <Suspense fallback={link(`/playground/${themeId}`)}>
      <WithSearchParams render={link} themeId={themeId} />
    </Suspense>
  );
}
