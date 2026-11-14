import { cn } from "@repo/design-system/lib/utils";
import { ClipboardText as ClipboardList } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
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
import type { FormErrorText } from "./form-fields";
import { formFieldsSchema } from "./form-fields";

/** The defaults are QRdx's words; labels the owner typed are theirs. */
const DEFAULT_SUBMIT = "Send";
const DEFAULT_SUCCESS = "Thank you! Your response has been sent.";

export const formSchema = z.object({
  title: lineText(120).default(""),
  description: longText(1000).default(""),
  fields: formFieldsSchema,
  submitLabel: lineText(40)
    .min(1, "Add a button label")
    .default(DEFAULT_SUBMIT),
  successMessage: longText(500)
    .pipe(z.string().min(1, "Add a thank-you message"))
    .default(DEFAULT_SUCCESS),
});

export type FormProps = z.output<typeof formSchema>;

export function FormBlock({ id, props, context }: BlockRenderProps<FormProps>) {
  const t = useTranslations("scanPages.hosted.form");
  const titleId = `${id}-title`;
  const errors = (key: keyof FormErrorText) => t.raw(`errors.${key}`) as string;
  return (
    <section
      aria-label={props.title ? undefined : t("form")}
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
        submitLabel={
          props.submitLabel === DEFAULT_SUBMIT ? t("send") : props.submitLabel
        }
        successMessage={
          props.successMessage === DEFAULT_SUCCESS
            ? t("thanks")
            : props.successMessage
        }
        text={{
          errors: {
            required: errors("required"),
            consentRequired: errors("consentRequired"),
            enterText: errors("enterText"),
            tooLong: errors("tooLong"),
            email: errors("email"),
            phone: errors("phone"),
            stars: errors("stars"),
            nps: errors("nps"),
            choices: errors("choices"),
            choice: errors("choice"),
            invalid: errors("invalid"),
          },
          checkAnswer: t("checkAnswer"),
          starsOf: t.raw("starsOf") as string,
          sending: t("sending"),
          answerOne: t("answerOne"),
          preview: t("preview"),
          securityCheck: t("securityCheck"),
          tooMany: t("tooMany"),
          couldntSend: t("couldntSend"),
          offline: t("offline"),
          demo: t("demo"),
          honeypot: t("honeypot"),
          closed: t("closed"),
        }}
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
