"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Spinner, Tick } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { GalleryEdit } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import {
  AVATAR_INPUT_ACCEPT,
  AVATAR_INPUT_MAX_BYTES,
  AVATAR_MAX_BYTES,
  AVATAR_PIXELS,
  initialsOf,
} from "@/lib/account/avatar";
import { removeAvatar, updateProfileName, uploadAvatar } from "../_lib/actions";
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

/** Center-crops to a square and re-encodes (which also drops EXIF/GPS data). */
async function squareAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PIXELS;
  canvas.height = AVATAR_PIXELS;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.imageSmoothingQuality = "high";
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_PIXELS,
    AVATAR_PIXELS,
  );
  bitmap.close();
  const encode = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, quality),
    );
  // Browsers that can't write WebP hand back a PNG instead.
  const blob = (await encode("image/webp", 0.9)) ?? (await encode("image/png"));
  if (!blob) throw new Error("Encoding failed");
  return blob;
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
      toast.error("Choose a picture under 10 MB.");
      return;
    }
    setBusy("upload");
    try {
      let blob: Blob;
      try {
        blob = await squareAvatar(file);
      } catch {
        toast.error("We couldn't read that picture. Try a PNG or JPEG.");
        return;
      }
      if (blob.size > AVATAR_MAX_BYTES) {
        toast.error("That picture is too large. Try a smaller one.");
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
                {image ? "Change picture" : "Upload picture"}
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
              Remove
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {profile.canUpload
            ? "PNG, JPEG or WebP. We crop it to a square."
            : image
              ? "Picture uploads aren't set up on this server."
              : "Your initials are shown. Picture uploads aren't set up on this server."}
        </p>
      </div>
    </div>
  );
}

function NameField({ initialName }: { initialName: string }) {
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
        toast.success("Name updated");
        void refetch();
        router.refresh();
      })
      .catch(() => toast.error("Something went wrong. Please try again."))
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
        placeholder="Your name"
        value={name}
      />
      <Button
        className="shrink-0"
        disabled={!changed || !trimmed || pending}
        type="submit"
        variant={changed && trimmed ? "default" : "outline"}
      >
        {pending && <Spinner className="animate-spin" />}
        Save
      </Button>
    </form>
  );
}

export function ProfileSection({ profile }: { profile: ProfileView }) {
  return (
    <SettingsSection
      description="How you appear in QRdx and to people in your teams."
      id="profile"
      title="Profile"
    >
      <SettingsRow
        description="Shown in the header and in team member lists."
        label="Picture"
      >
        <AvatarField profile={profile} />
      </SettingsRow>
      <SettingsRow
        description={
          <span id="profile-name-help">
            Your name or the name your team knows you by.
          </span>
        }
        htmlFor="profile-name"
        label="Name"
      >
        <NameField initialName={profile.name} />
      </SettingsRow>
      <SettingsRow
        description="Sign-in codes and team invitations go here."
        label="Email"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium break-all">{profile.email}</span>
          {profile.emailVerified ? (
            <Badge variant="secondary">
              <Tick aria-hidden />
              Verified
            </Badge>
          ) : (
            <Badge variant="outline">Not verified</Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-2 text-xs text-pretty">
          Your email address can't be changed here. To move your account to
          another address, email{" "}
          <a
            className="hover:text-foreground underline underline-offset-4"
            href="mailto:support@qrdx.dev"
          >
            support@qrdx.dev
          </a>{" "}
          from this one. Member since {profile.memberSince}.
        </p>
      </SettingsRow>
    </SettingsSection>
  );
}
