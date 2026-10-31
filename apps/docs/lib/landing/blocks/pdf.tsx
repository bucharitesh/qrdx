import { cn } from "@repo/design-system/lib/utils";
import {
  Import as Download,
  ExportSquare as ExternalLink,
  DocumentText as FileText,
} from "iconsax-reactjs";
import { z } from "zod";
import {
  buttonClass,
  lineText,
  longText,
  mutedTextClass,
  surfaceClass,
} from "@/components/landing/block-kit";
import { BlockHeading, PreviewPlaceholder } from "@/lib/files/block-ui";
import { fileSourceSchema, sourceName, sourceUrl } from "@/lib/files/source";
import { type BlockRenderProps, registerBlock } from "../registry";
import { PdfEditor } from "./pdf-editor";
import { PdfInlineViewer } from "./pdf-viewer";

export const pdfBlockSchema = z.object({
  /** null until a PDF is chosen */
  source: fileSourceSchema.nullable().default(null),
  title: lineText(120).default(""),
  description: longText(500).default(""),
  /** Show the document inline on screens wide enough to read it */
  inline: z.boolean().default(true),
  allowDownload: z.boolean().default(true),
  openLabel: lineText(40).default(""),
});

export type PdfBlockProps = z.output<typeof pdfBlockSchema>;

function PdfBlock({ id, props, context }: BlockRenderProps<PdfBlockProps>) {
  const src = sourceUrl(props.source, context);
  if (!src) {
    return context.mode === "preview" ? (
      <PreviewPlaceholder icon={<FileText className="size-6" />}>
        Choose a PDF to show here
      </PreviewPlaceholder>
    ) : null;
  }
  const downloadSrc =
    props.source?.type === "file"
      ? (sourceUrl(props.source, context, { download: true }) ?? src)
      : src;
  const name = sourceName(props.source) || "Document.pdf";
  const label = props.title || name;

  return (
    <section aria-label={label} className="space-y-3">
      <BlockHeading description={props.description} title={props.title} />
      {props.inline && <PdfInlineViewer src={src} title={label} />}
      <div className={cn(surfaceClass, "flex items-center gap-3 p-3")}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-(--lp-radius) bg-(--lp-primary) text-(--lp-primary-fg)">
          <FileText aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">{name}</p>
          <p className={cn("text-xs", mutedTextClass)}>PDF document</p>
        </div>
      </div>
      <div className={cn("grid gap-2", props.allowDownload && "grid-cols-2")}>
        <a
          className={buttonClass("filled")}
          data-lp-block={id}
          data-lp-target="open"
          href={src}
          rel="noopener noreferrer"
          target="_blank"
        >
          <ExternalLink aria-hidden="true" className="size-4" />
          {props.openLabel || "Open PDF"}
        </a>
        {props.allowDownload && (
          <a
            className={buttonClass("outline")}
            data-lp-block={id}
            data-lp-target="download"
            download={props.source?.type === "file" ? name : undefined}
            href={downloadSrc}
            rel="noopener noreferrer"
          >
            <Download aria-hidden="true" className="size-4" />
            Download
          </a>
        )}
      </div>
    </section>
  );
}

export const pdfBlock = registerBlock({
  type: "pdf",
  category: "media",
  label: "PDF",
  description: "A menu, brochure or manual to read or download",
  icon: FileText,
  schema: pdfBlockSchema,
  defaults: {},
  Render: PdfBlock,
  Editor: PdfEditor,
});
