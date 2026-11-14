"use client";

import { toast } from "@repo/design-system";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { LOCALE_INFO, LOCALES, type Locale } from "@repo/i18n/config";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateUserLocale } from "@/actions/user-locale";

/**
 * Settings > General: the language of the app and of the emails QRdx sends.
 * New accounts start with the language the site was in at sign-up.
 */
export function LanguageForm({ initialLocale }: { initialLocale: Locale }) {
  const t = useTranslations("app.settings.general.language");
  const router = useRouter();
  const [locale, setLocale] = useState(initialLocale);
  const [pending, startTransition] = useTransition();

  const change = (next: string) => {
    const previous = locale;
    setLocale(next as Locale);
    startTransition(async () => {
      const result = await updateUserLocale(next);
      if (!result.ok) {
        setLocale(previous);
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(t("saved", { language: LOCALE_INFO[next as Locale].name }));
      // Server components render again in the new language.
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="app-language">{t("label")}</Label>
        <Select disabled={pending} onValueChange={change} value={locale}>
          <SelectTrigger className="w-full sm:w-72" id="app-language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCALES.map((option) => (
              <SelectItem key={option} lang={option} value={option}>
                {LOCALE_INFO[option].name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">{t("note")}</p>
      </CardContent>
    </Card>
  );
}
