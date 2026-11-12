"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Spinner, Tick } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { GalleryEdit } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";
import {
  AVATAR_INPUT_ACCEPT,
  AVATAR_INPUT_MAX_BYTES,
  AVATAR_MAX_BYTES,
  AVATAR_PIXELS,
  initialsOf,
} from "@/lib/account/avatar";
import { squareImage } from "@/lib/square-image";
import { removeAvatar, updateProfileName, uploadAvatar } from "../_lib/actions";
import { ChangeEmailDialog } from "./change-email-dialog";
import { SettingsRow, SettingsSection } from "./settings-section";

export interface ProfileView {
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  memberSince: string;
  /** R2 is configured, so pictures can be uploaded */
  canUpload: boolean;
}

function Avatar({
  image,
  name,
  email,
}: {
  image: string | null;
  name: string;
  email: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = image && failed !== image;
  return (
    <span className="bg-muted text-muted-foreground relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border text-lg font-medium select-none">
      {showImage ? (
        <img
          alt=""
          className="size-full object-cover"
          height={64}
          onError={() => setFailed(image)}
          referrerPolicy="no-referrer"
          src={image}
          width={64}
        />
      ) : (
        <span aria-hidden>{initialsOf(name, email)}</span>
      )}
    </span>
  );
}

function AvatarField({ profile }: { profile: ProfileView }) {
  const t = useTranslations("app.settings.account.profileSection");
  const router = useRouter();
  const { refetch } = authClient.useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState(profile.image);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);

  // The header avatar (session) and server-rendered parts catch up in the background.
  const done = (message: string) => {
    toast.success(message);
    void refetch();
    router.refresh();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > AVATAR_INPUT_MAX_BYTES) {
      toast.error(t("chooseAPictureUnder10"));
      return;
    }
    setBusy("upload");
    try {
      let blob: Blob;
      try {
        blob = await squareImage(file, AVATAR_PIXELS);
      } catch {
        toast.error(t("weCouldntReadThatPicture"));
        return;
      }
      if (blob.size > AVATAR_MAX_BYTES) {
        toast.error(t("thatPictureIsTooLarge"));
        return;
      }
      const form = new FormData();
      form.append("avatar", new File([blob], "avatar", { type: blob.type }));
      const result = await uploadAvatar(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setImage(result.image ?? null);
      done("Picture updated");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onRemove = async () => {
    setBusy("remove");
    try {
      const result = await removeAvatar();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setImage(null);
      done("Picture removed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar email={profile.email} image={image} name={profile.name} />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {profile.canUpload && (
            <>
              <input
                accept={AVATAR_INPUT_ACCEPT}
                className="sr-only"
                id="avatar-file"
                onChange={(event) => onFile(event.target.files?.[0])}
                ref={inputRef}
                tabIndex={-1}
                type="file"
              />
              <Button
                disabled={busy !== null}
                onClick={() => inputRef.current?.click()}
                size="sm"
                variant="outline"
              >
                {busy === "upload" ? (
                  <Spinner className="animate-spin" />
                ) : (
                  <GalleryEdit aria-hidden />
                )}
                {image ? t("changePicture") : t("uploadPicture")}
              </Button>
            </>
          )}
          {image && (
            <Button
              disabled={busy !== null}
              onClick={onRemove}
              size="sm"
              variant="ghost"
            >
              {busy === "remove" && <Spinner className="animate-spin" />}
              {t("remove")}
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {profile.canUpload
            ? t("pngJpegOrWebpWe")
            : image
              ? t("pictureUploadsArentSetUp")
              : t("yourInitialsAreShownPicture")}
        </p>
      </div>
    </div>
  );
}

function NameField({ initialName }: { initialName: string }) {
  const t = useTranslations("app.settings.account.profileSection");
  const router = useRouter();
  const { refetch } = authClient.useSession();
  const [saved, setSaved] = useState(initialName);
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const trimmed = name.trim();
  const changed = trimmed !== saved.trim();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!changed || !trimmed) return;
    setPending(true);
    void updateProfileName({ name: trimmed })
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setSaved(trimmed);
        setName(trimmed);
        toast.success(t("nameUpdated"));
        void refetch();
        router.refresh();
      })
      .catch(() => toast.error(t("somethingWentWrongPleaseTry")))
      .finally(() => setPending(false));
  };

  return (
    <form className="flex max-w-md gap-2" onSubmit={onSubmit}>
      <Input
        aria-describedby="profile-name-help"
        autoComplete="name"
        id="profile-name"
        maxLength={64}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("yourName")}
        value={name}
      />
      <Button
        className="shrink-0"
        disabled={!changed || !trimmed || pending}
        type="submit"
        variant={changed && trimmed ? "default" : "outline"}
      >
        {pending && <Spinner className="animate-spin" />}
        {t("save")}
      </Button>
    </form>
  );
}

export function ProfileSection({ profile }: { profile: ProfileView }) {
  const t = useTranslations("app.settings.account.profileSection");
  return (
    <SettingsSection
      description={t("howYouAppearInQrdx")}
      id="profile"
      title={t("profile")}
    >
      <SettingsRow description={t("shownInTheHeaderAnd")} label={t("picture")}>
        <AvatarField profile={profile} />
      </SettingsRow>
      <SettingsRow
        description={
          <span id="profile-name-help">{t("yourNameOrTheName")}</span>
        }
        htmlFor="profile-name"
        label={t("name")}
      >
        <NameField initialName={profile.name} />
      </SettingsRow>
      <SettingsRow description={t("signInCodesAndTeam")} label={t("email")}>
        <EmailField profile={profile} />
      </SettingsRow>
    </SettingsSection>
  );
}

function EmailField({ profile }: { profile: ProfileView }) {
  const t = useTranslations("app.settings.account.profileSection");
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex max-w-md flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-sm font-medium break-all">{profile.email}</span>
          {profile.emailVerified ? (
            <Badge variant="secondary">
              <Tick aria-hidden />
              {t("verified")}
            </Badge>
          ) : (
            <Badge variant="outline">{t("notVerified")}</Badge>
          )}
        </div>
        <Button onClick={() => setOpen(true)} size="sm" variant="outline">
          {t("change")}
        </Button>
      </div>
      <p className="text-muted-foreground mt-2 text-xs text-pretty">
        {t("memberSinceMembersince", { memberSince: profile.memberSince })}
      </p>
      <ChangeEmailDialog
        currentEmail={profile.email}
        onOpenChange={setOpen}
        open={open}
      />
    </>
  );
}
