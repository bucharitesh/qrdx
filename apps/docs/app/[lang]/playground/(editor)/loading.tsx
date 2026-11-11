import { useTranslations } from "next-intl";
import { QrdxLogoAnimation } from "@/components/qrdx-logo-animation";

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
