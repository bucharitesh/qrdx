"use client";

import { toast } from "@repo/design-system";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { GalleryEdit, Link21 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";
import {
  removeWorkspaceLogo,
  setWorkspaceLogoUrl,
  uploadWorkspaceLogo,
} from "@/actions/workspace-logo";
import { useAvailability } from "@/components/availability-provider";
import { useRefreshTeams } from "@/components/org-switcher";
import { squareImage } from "@/lib/square-image";
import {
  LOGO_INPUT_ACCEPT,
  LOGO_INPUT_MAX_BYTES,
  LOGO_MAX_BYTES,
  LOGO_PIXELS,
  LOGO_URL_MAX_LENGTH,
  logoUrlProblem,
} from "@/lib/workspace-logo";
import { WorkspaceAvatar } from "./workspace-avatar";

/**
 * The open workspace's logo: upload one (when file storage is set up) or
 * point at an https image; without one the switcher shows the initial.
 */
export function WorkspaceLogoField({
  name,
  logo: savedLogo,
  canEdit,
}: {
  name: string;
  logo: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations("app.workspaces.workspaceLogoField");
  const refresh = useRefreshTeams();
  const canUpload = useAvailability().has("fileStorage");
  const inputRef = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState(savedLogo);
  const [busy, setBusy] = useState<"upload" | "url" | "remove" | null>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");

  const done = (next: string | null, message: string) => {
    setLogo(next);
    toast.success(message);
    refresh();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > LOGO_INPUT_MAX_BYTES) {
      toast.error(t("chooseAPictureUnder10"));
      return;
    }
    setBusy("upload");
    try {
      let blob: Blob;
      try {
        blob = await squareImage(file, LOGO_PIXELS);
      } catch {
        toast.error(t("weCouldntReadThatPicture"));
        return;
      }
      if (blob.size > LOGO_MAX_BYTES) {
        toast.error(t("thatPictureIsTooLarge"));
        return;
      }
      const form = new FormData();
      form.append("logo", new File([blob], "logo", { type: blob.type }));
      const result = await uploadWorkspaceLogo(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      done(result.logo, "Logo updated");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const saveUrl = async (event: FormEvent) => {
    event.preventDefault();
    const problem = logoUrlProblem(url.trim());
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy("url");
    try {
      const result = await setWorkspaceLogoUrl({ url: url.trim() });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setUrlOpen(false);
      setUrl("");
      done(result.logo, "Logo updated");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    try {
      const result = await removeWorkspaceLogo();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      done(null, "Logo removed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <Label>{t("logo")}</Label>
      <div className="flex flex-wrap items-center gap-4">
        <WorkspaceAvatar logo={logo} name={name} size="lg" />
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {canUpload && (
              <>
                <input
                  accept={LOGO_INPUT_ACCEPT}
                  className="sr-only"
                  id="workspace-logo-file"
                  onChange={(event) => onFile(event.target.files?.[0])}
                  ref={inputRef}
                  tabIndex={-1}
                  type="file"
                />
                <Button
                  disabled={busy !== null}
                  onClick={() => inputRef.current?.click()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {busy === "upload" ? (
                    <ModuleOrbit aria-hidden />
                  ) : (
                    <GalleryEdit aria-hidden />
                  )}
                  {logo ? t("changeLogo") : t("uploadLogo")}
                </Button>
              </>
            )}
            <Button
              aria-expanded={urlOpen}
              disabled={busy !== null}
              onClick={() => setUrlOpen((open) => !open)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Link21 aria-hidden />
              {t("useAnImageUrl")}
            </Button>
            {logo && (
              <Button
                disabled={busy !== null}
                onClick={remove}
                size="sm"
                type="button"
                variant="ghost"
              >
                {busy === "remove" && <ModuleOrbit aria-hidden />}
                {t("remove")}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {logo ? t("theWorkspacesLogo") : t("noLogoYetTheSwitcher")}
          </p>
        )}
      </div>
      {canEdit && urlOpen && (
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={saveUrl}>
          <Input
            aria-label={t("logoImageUrl")}
            autoComplete="off"
            inputMode="url"
            maxLength={LOGO_URL_MAX_LENGTH}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/logo.png"
            required
            type="url"
            value={url}
          />
          <Button
            disabled={busy !== null || !url.trim()}
            size="sm"
            type="submit"
          >
            {busy === "url" && <ModuleOrbit aria-hidden />}
            {t("save")}
          </Button>
        </form>
      )}
      <p className="text-muted-foreground text-xs text-pretty">
        {t("squareWorksBestShownIn")}
        {canUpload ? t("uploadsAreCroppedToA") : ""}
      </p>
    </div>
  );
}
