import { QrdxLogoAnimation } from "@repo/design-system/components/brand/qrdx-logo-animation";
import { useTranslations } from "next-intl";

export default function Loading() {
  const t = useTranslations("playground");
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <QrdxLogoAnimation size={100} />
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      </div>
    </div>
  );
}
