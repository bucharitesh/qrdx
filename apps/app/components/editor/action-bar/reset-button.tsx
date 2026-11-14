import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { RotateLeft } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { TooltipWrapper } from "@/components/tooltip-wrapper";

interface ResetButtonProps extends React.ComponentProps<typeof Button> {}

export function ResetButton({ className, ...props }: ResetButtonProps) {
  const t = useTranslations("editor.actionBar.resetButton");
  return (
    <TooltipWrapper label={t("resetToPresetDefaults")} kbd="R" asChild>
      <Button variant="ghost" size="sm" className={cn(className)} {...props}>
        <RotateLeft className="size-4" />
        <span className="hidden text-sm md:block sr-only">{t("reset")}</span>
      </Button>
    </TooltipWrapper>
  );
}
