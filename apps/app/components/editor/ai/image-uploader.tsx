import { MAX_IMAGE_FILE_SIZE, MAX_IMAGE_FILES } from "@repo/config";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { GalleryAdd as ImagePlus } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { ALLOWED_IMAGE_TYPES } from "@/utils/ai/image-upload";

interface ImageUploaderProps extends ComponentProps<typeof Button> {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onImagesUpload: (files: File[]) => void;
}

export function ImageUploader({
  fileInputRef,
  onImagesUpload,
  disabled,
  className,
  ...props
}: ImageUploaderProps) {
  const t = useTranslations("editor.ai.imageUploader");
  const handleImagesUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList) return;

    const files = Array.from(fileList);
    onImagesUpload(files);
  };

  return (
    <>
      <input
        type="file"
        multiple
        max={MAX_IMAGE_FILES}
        size={MAX_IMAGE_FILE_SIZE}
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
        aria-label={t("uploadImageForThemeGeneration")}
        ref={fileInputRef}
        onChange={handleImagesUpload}
        disabled={disabled}
      />
      <TooltipWrapper label={t("attachImage")} asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "text-muted-foreground hover:text-foreground flex items-center gap-1.5 shadow-none",
            "@max-[350px]/form:w-8",
            className,
          )}
          disabled={disabled}
          {...props}
        >
          <ImagePlus />{" "}
          <span className="hidden @[350px]/form:inline-flex">{t("image")}</span>
        </Button>
      </TooltipWrapper>
    </>
  );
}
