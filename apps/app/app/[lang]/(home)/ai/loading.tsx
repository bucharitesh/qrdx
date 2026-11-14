import { Scanframe } from "@repo/design-system/components/loaders";
import { useTranslations } from "next-intl";

export default function Loading() {
  // The shared "Loading…" string; the ai namespace has none of its own.
  const t = useTranslations("app.dashboard.loading");
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Scanframe label={t("loading")} />
    </div>
  );
}
