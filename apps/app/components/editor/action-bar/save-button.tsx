import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Heart } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { TooltipWrapper } from "@/components/tooltip-wrapper";

interface SaveButtonProps extends React.ComponentProps<typeof Button> {
  isSaving: boolean;
}

export function SaveButton({
  isSaving,
  disabled,
  className,
  ...props
}: SaveButtonProps) {
  const t = useTranslations("editor.actionBar.saveButton");
  return (
    <TooltipWrapper label={t("saveDesign")} kbd="S" asChild>
      <Button
        variant="ghost"
        size="sm"
        className={cn(className)}
        disabled={isSaving || disabled}
        {...props}
      >
        {isSaving ? (
          <ModuleOrbit aria-hidden className="size-4" />
        ) : (
          <Heart className="size-4" />
        )}
        <span className="hidden text-sm md:block sr-only">{t("save")}</span>
      </Button>
    </TooltipWrapper>
  );
}
