import { cn } from "@repo/design-system/lib/utils";
import { ClipboardText as ClipboardList } from "iconsax-reactjs";
import { z } from "zod";
import {
  buttonShapeClass,
  lineText,
  longText,
  mutedTextClass,
  surfaceClass,
} from "@/components/landing/block-kit";
import { LpHeading } from "@/components/landing/heading";
import { type BlockRenderProps, registerBlock } from "../registry";
import { FormClient } from "./form-client";
import { FormEditor } from "./form-editor";
import { formFieldsSchema } from "./form-fields";

export const formSchema = z.object({
  title: lineText(120).default(""),
  description: longText(1000).default(""),
  fields: formFieldsSchema,
  submitLabel: lineText(40).min(1, "Add a button label").default("Send"),
  successMessage: longText(500)
    .pipe(z.string().min(1, "Add a thank-you message"))
    .default("Thank you! Your response has been sent."),
});

export type FormProps = z.output<typeof formSchema>;

export function FormBlock({ id, props, context }: BlockRenderProps<FormProps>) {
  const titleId = `${id}-title`;
  return (
    <section
      aria-label={props.title ? undefined : "Form"}
      aria-labelledby={props.title ? titleId : undefined}
      className={cn(surfaceClass, "space-y-4 p-5")}
    >
      {(props.title || props.description) && (
        <div className="space-y-1">
          {props.title && (
            <LpHeading
              as="h2"
              preview={context.thumbnail}
              className="text-lg leading-tight font-semibold"
              id={titleId}
            >
              {props.title}
            </LpHeading>
          )}
          {props.description && (
            <p className={cn(mutedTextClass, "text-sm whitespace-pre-line")}>
              {props.description}
            </p>
          )}
        </div>
      )}
      <FormClient
        blockId={id}
        demo={context.demo}
        fields={props.fields}
        live={context.mode === "live"}
        pageId={context.pageId}
        qrCodeId={context.qrCodeId}
        shapeClassName={buttonShapeClass(context.theme)}
        submitLabel={props.submitLabel}
        successMessage={props.successMessage}
      />
    </section>
  );
}

registerBlock({
  type: "form",
  category: "forms",
  label: "Form",
  description:
    "Questions, ratings, NPS and contact details; responses go to your inbox",
  icon: ClipboardList,
  schema: formSchema,
  defaults: {
    title: "We'd love your feedback",
    fields: [
      {
        id: "rating",
        type: "stars",
        label: "How was your experience?",
        required: true,
      },
      {
        id: "comments",
        type: "text",
        label: "What could we do better?",
        multiline: true,
      },
      { id: "email", type: "email", label: "Email (if you'd like a reply)" },
    ],
  },
  Render: FormBlock,
  Editor: FormEditor,
});
