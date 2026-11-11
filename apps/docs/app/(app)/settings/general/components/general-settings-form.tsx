"use client";

import type { UserSettings } from "@repo/database/schema";
import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { updateUserSettings } from "@/actions/user-settings";
import { useUserSettings } from "@/lib/hooks/use-user-settings";

interface GeneralSettingsFormProps {
  initialSettings: UserSettings | null;
}

export function GeneralSettingsForm({
  initialSettings,
}: GeneralSettingsFormProps) {
  const t = useTranslations("app.settings.general.generalSettingsForm");
  const [keyboardShortcuts, setKeyboardShortcuts] = useState(
    initialSettings?.keyboardShortcuts ?? true,
  );
  const [isSaving, setIsSaving] = useState(false);
  const { refreshSettings } = useUserSettings();

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const result = await updateUserSettings({
        keyboardShortcuts,
      });

      if (result.success) {
        toast.success(t("settingsSavedSuccessfully"));
        // Refresh the settings context so components update immediately
        await refreshSettings();
      } else {
        toast.error(t("failedToSaveSettings"));
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error(t("failedToSaveSettings"));
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    keyboardShortcuts !== (initialSettings?.keyboardShortcuts ?? true);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="sr-only">
          <CardTitle>{t("keyboardShortcuts")}</CardTitle>
          <CardDescription>
            {t("controlKeyboardShortcutsThroughoutThe")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="keyboard-shortcuts">
                {t("enableKeyboardShortcuts")}
              </Label>
              <p className="text-muted-foreground text-sm">
                {t("allowKeyboardShortcutsForQuick")}
              </p>
            </div>
            <Switch
              id="keyboard-shortcuts"
              checked={keyboardShortcuts}
              onCheckedChange={setKeyboardShortcuts}
            />
          </div>
        </CardContent>
      </Card>

      {hasChanges && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? t("saving") : t("saveChanges")}
          </Button>
        </div>
      )}
    </div>
  );
}
