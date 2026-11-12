"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { saveCommunityProfileAction } from "@/actions/community";
import {
  HANDLE_MAX_LENGTH,
  handleProblem,
  normalizeHandle,
  profilePath,
} from "@/lib/community/handles";
import type { MyCommunityProfile } from "@/lib/community/profiles";
import { SettingsRow, SettingsSection } from "./settings-section";

/**
 * The public creator profile: an opt-in handle (/community/@handle), the
 * name items are published under, and whether the account picture shows.
 */
export function CommunityProfileSection({
  profile,
}: {
  profile: MyCommunityProfile;
}) {
  const t = useTranslations("app.settings.account.communityProfileSection");
  const router = useRouter();
  const [handle, setHandle] = useState(profile.handle ?? "");
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [showPicture, setShowPicture] = useState(profile.showPicture);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (profile.official) {
    return (
      <SettingsSection
        description={t("thisAccountPublishesToThe")}
        id="community"
        title={t("communityProfile")}
      >
        <SettingsRow label={t("profile")}>
          <Link
            className="text-sm underline underline-offset-2"
            href={profilePath(profile.handle ?? "qrdx")}
          >
            @{profile.handle ?? t("qrdx")}
          </Link>
        </SettingsRow>
      </SettingsSection>
    );
  }

  const normalized = normalizeHandle(handle);
  const problem = normalized ? handleProblem(normalized) : null;

  const save = async (next: { handle: string }) => {
    setSaving(true);
    setError(null);
    const result = await saveCommunityProfileAction({
      handle: next.handle,
      displayName,
      showPicture,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setHandle(result.data.handle ?? "");
    toast.success(
      result.data.handle
        ? t("savedYourProfileIsAt", { handle: result.data.handle })
        : t("saved"),
    );
    router.refresh();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (problem) {
      setError(problem);
      return;
    }
    void save({ handle: normalized });
  };

  return (
    <SettingsSection
      description={t("howYouAppearOnWhat")}
      id="community"
      title={t("communityProfile")}
    >
      <form onSubmit={submit}>
        <SettingsRow
          description={t("givesYouAPublicPage")}
          htmlFor="community-handle"
          label={t("handle")}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">@</span>
              <Input
                aria-describedby="community-handle-help"
                autoCapitalize="none"
                autoComplete="off"
                id="community-handle"
                maxLength={HANDLE_MAX_LENGTH + 1}
                onChange={(event) => {
                  setHandle(event.target.value);
                  setError(null);
                }}
                placeholder={t("yourHandle")}
                spellCheck={false}
                value={handle}
              />
            </div>
            <p
              className="text-muted-foreground text-xs"
              id="community-handle-help"
            >
              {profile.handle
                ? t.rich("liveAtCommunityHandleClear", {
                    handle: profile.handle,
                    link: (chunks) => (
                      <Link
                        className="underline underline-offset-2"
                        href={profilePath(profile.handle ?? "")}
                      >
                        {chunks}
                      </Link>
                    ),
                  })
                : t("n3To30LowercaseLetters")}
            </p>
          </div>
        </SettingsRow>
        <SettingsRow
          description={t("shownOnYourItemsAnd")}
          htmlFor="community-name"
          label={t("displayName")}
        >
          <Input
            id="community-name"
            maxLength={40}
            onChange={(event) => setDisplayName(event.target.value)}
            value={displayName}
          />
        </SettingsRow>
        <SettingsRow label={t("picture")}>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={showPicture}
              disabled={!profile.accountPicture}
              id="community-picture"
              onCheckedChange={(value) => setShowPicture(value === true)}
            />
            <label className="text-sm" htmlFor="community-picture">
              {profile.accountPicture
                ? t("showMyProfilePicture")
                : t("addAProfilePictureAbove")}
            </label>
          </div>
        </SettingsRow>
        <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-4 sm:px-6">
          {error && (
            <p className="text-destructive mr-auto text-sm" role="alert">
              {error}
            </p>
          )}
          {profile.handle && (
            <Button
              disabled={saving}
              onClick={() => void save({ handle: "" })}
              type="button"
              variant="outline"
            >
              {t("releaseHandle")}
            </Button>
          )}
          <Button disabled={saving} type="submit">
            {saving && <Spinner className="size-4" />}
            {t("save")}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
