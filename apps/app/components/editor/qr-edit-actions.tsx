/** biome-ignore-all lint/suspicious/noArrayIndexKey: false positive */

import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { cn } from "@repo/design-system/lib/utils";
import {
  type Icon as LucideIcon,
  ColorSwatch as Palette,
  Refresh2 as RefreshCw,
  ArrowRotateLeft as Undo2,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";

interface MenuItemProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

const MenuItem = ({
  icon: Icon,
  label,
  onClick,
  disabled,
  title,
}: MenuItemProps) => {
  return (
    <DropdownMenuItem
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md transition-colors",
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:bg-accent/50 cursor-pointer",
      )}
      title={title}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span>{label}</span>
    </DropdownMenuItem>
  );
};

interface ThemeControlActionsProps {
  hasChanges: boolean;
  hasPresetChanges: boolean;
  onReset: () => void;
  onResetToPreset: () => void;
  onImportClick: () => void;
}

const ThemeControlActions = ({
  hasChanges,
  hasPresetChanges,
  onReset,
  onResetToPreset,
}: ThemeControlActionsProps) => {
  const t = useTranslations("editor.qrEditActions");
  const menuItems: MenuItemProps[] = [
    {
      icon: RefreshCw,
      label: t("resetToCurrentPreset"),
      onClick: onResetToPreset,
      disabled: !hasPresetChanges,
      title: hasPresetChanges
        ? t("resetToCurrentPreset2")
        : t("noChangesFromPreset"),
    },
    {
      icon: Undo2,
      label: t("resetToDefaultTheme"),
      onClick: onReset,
      disabled: !hasChanges,
      title: hasChanges ? t("resetToBaseTheme") : t("noChangesToReset"),
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 gap-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          <Palette className="size-3.5" />
          <span className="text-sm">{t("options")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-fit p-2">
        {menuItems.map((item, index) => (
          <MenuItem key={index} {...item} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeControlActions;
