"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [handle, setHandle] = useState(profile.handle ?? "");
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [showPicture, setShowPicture] = useState(profile.showPicture);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (profile.official) {
    return (
      <SettingsSection
        description="This account publishes to the community as the official QRdx profile."
        id="community"
        title="Community profile"
      >
        <SettingsRow label="Profile">
          <Link
            className="text-sm underline underline-offset-2"
            href={profilePath(profile.handle ?? "qrdx")}
          >
            @{profile.handle ?? "qrdx"}
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
        ? `Saved. Your profile is at /community/@${result.data.handle}`
        : "Saved.",
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
      description="How you appear on what you publish to the community. A handle is optional."
      id="community"
      title="Community profile"
    >
      <form onSubmit={submit}>
        <SettingsRow
          description="Gives you a public page with everything you publish. Never taken from your email."
          htmlFor="community-handle"
          label="Handle"
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
                placeholder="your-handle"
                spellCheck={false}
                value={handle}
              />
            </div>
            <p
              className="text-muted-foreground text-xs"
              id="community-handle-help"
            >
              {profile.handle ? (
                <>
                  Live at{" "}
                  <Link
                    className="underline underline-offset-2"
                    href={profilePath(profile.handle)}
                  >
                    /community/@{profile.handle}
                  </Link>
                  . Clear it to release the handle.
                </>
              ) : (
                "3 to 30 lowercase letters, numbers, _ or -."
              )}
            </p>
          </div>
        </SettingsRow>
        <SettingsRow
          description="Shown on your items and profile."
          htmlFor="community-name"
          label="Display name"
        >
          <Input
            id="community-name"
            maxLength={40}
            onChange={(event) => setDisplayName(event.target.value)}
            value={displayName}
          />
        </SettingsRow>
        <SettingsRow label="Picture">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={showPicture}
              disabled={!profile.accountPicture}
              id="community-picture"
              onCheckedChange={(value) => setShowPicture(value === true)}
            />
            <label className="text-sm" htmlFor="community-picture">
              {profile.accountPicture
                ? "Show my profile picture"
                : "Add a profile picture above to show one"}
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
              Release handle
            </Button>
          )}
          <Button disabled={saving} type="submit">
            {saving && <Spinner className="size-4" />}
            Save
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
