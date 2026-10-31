import { MouseCircle as MousePointerClick } from "iconsax-reactjs";
import { z } from "zod";
import {
  buttonClass,
  lineText,
  linkProps,
  linkUrlSchema,
  mutedTextClass,
} from "@/components/landing/block-kit";
import { type BlockRenderProps, registerBlock } from "../registry";
import { ButtonEditor } from "./button-editor";

export const BUTTON_STYLES = ["filled", "outline", "soft"] as const;

export const buttonSchema = z.object({
  label: lineText(80).min(1, "Add a button label"),
  url: linkUrlSchema,
  style: z.enum(BUTTON_STYLES).default("filled"),
  /** Small line under the button */
  note: lineText(160).default(""),
});

export type ButtonProps = z.output<typeof buttonSchema>;

function ButtonBlock({ id, props }: BlockRenderProps<ButtonProps>) {
  return (
    <div className="space-y-1.5">
      <a className={buttonClass(props.style)} {...linkProps(props.url, id)}>
        {props.label}
      </a>
      {props.note && (
        <p className={`text-center text-xs ${mutedTextClass}`}>{props.note}</p>
      )}
    </div>
  );
}

export const buttonBlock = registerBlock({
  type: "button",
  category: "links",
  label: "Button",
  description: "One prominent call to action",
  icon: MousePointerClick,
  schema: buttonSchema,
  defaults: { label: "Visit our website", url: "https://example.com" },
  Render: ButtonBlock,
  Editor: ButtonEditor,
});
