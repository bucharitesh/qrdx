import { cn } from "@repo/design-system/lib/utils";
import { Download, ExternalLink, File as FileIcon } from "lucide-react";
import { z } from "zod";
import {
  itemIdSchema,
  lineText,
  longText,
  mutedTextClass,
  surfaceClass,
} from "@/components/landing/block-kit";
import { BlockHeading, PreviewPlaceholder } from "@/lib/files/block-ui";
import { FileKindIcon } from "@/lib/files/components/file-kind-icon";
import { fileSourceSchema, sourceName, sourceUrl } from "@/lib/files/source";
import { FILE_KIND_LABELS, FILE_KINDS } from "@/lib/files/types";
import { type BlockRenderProps, registerBlock } from "../registry";
import { FileDownloadEditor } from "./file-download-editor";

export const MAX_DOWNLOADS = 20;

export const downloadItemSchema = z.object({
  id: itemIdSchema,
  source: fileSourceSchema,
  label: lineText(120).default(""),
  /** Kind of an uploaded file (kept when the file is replaced) */
  kind: z.enum(FILE_KINDS).optional(),
});

export const fileDownloadBlockSchema = z.object({
  title: lineText(120).default(""),
  description: longText(500).default(""),
  files: z.array(downloadItemSchema).max(MAX_DOWNLOADS).default([]),
});

export type FileDownloadBlockProps = z.output<typeof fileDownloadBlockSchema>;
export type DownloadItem = FileDownloadBlockProps["files"][number];

function FileDownloadBlock({
  id,
  props,
  context,
}: BlockRenderProps<FileDownloadBlockProps>) {
  const files = props.files.flatMap((item) => {
    const href =
      item.source.type === "file"
        ? sourceUrl(item.source, context, { download: true })
        : sourceUrl(item.source, context);
    return href ? [{ ...item, href }] : [];
  });
  if (files.length === 0) {
    return context.mode === "preview" ? (
      <PreviewPlaceholder icon={<Download className="size-6" />}>
        Add files people can download
      </PreviewPlaceholder>
    ) : null;
  }
  return (
    <section aria-label={props.title || "Downloads"} className="space-y-3">
      <BlockHeading description={props.description} title={props.title} />
      <ul className="space-y-2">
        {files.map((item, index) => {
          const name =
            item.label || sourceName(item.source) || `File ${index + 1}`;
          const external = item.source.type === "url";
          return (
            <li key={item.id}>
              <a
                className={cn(
                  surfaceClass,
                  "flex min-h-14 items-center gap-3 p-3 transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-(--lp-primary) focus-visible:outline-offset-2",
                )}
                data-lp-block={id}
                data-lp-target={`download-${index + 1}`}
                href={item.href}
                rel="noopener noreferrer"
                {...(external && { target: "_blank" })}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-(--lp-radius) bg-(--lp-primary) text-(--lp-primary-fg)">
                  {item.kind ? (
                    <FileKindIcon className="size-5" kind={item.kind} />
                  ) : (
                    <FileIcon aria-hidden="true" className="size-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sm">
                    {name}
                  </span>
                  <span className={cn("block text-xs", mutedTextClass)}>
                    {item.kind ? FILE_KIND_LABELS[item.kind] : "File"}
                    {external ? " · opens in a new tab" : ""}
                  </span>
                </span>
                {external ? (
                  <ExternalLink
                    aria-hidden="true"
                    className="size-5 shrink-0"
                  />
                ) : (
                  <Download aria-hidden="true" className="size-5 shrink-0" />
                )}
                <span className="sr-only">
                  {external ? "Open" : "Download"}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export const fileDownloadBlock = registerBlock({
  type: "file-download",
  category: "media",
  label: "Downloads",
  description: "Files people can save: PDFs, images, audio, video",
  icon: Download,
  schema: fileDownloadBlockSchema,
  defaults: {},
  Render: FileDownloadBlock,
  Editor: FileDownloadEditor,
});
