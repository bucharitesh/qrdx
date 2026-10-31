"use client";

import { Textarea } from "@repo/design-system/components/ui/textarea";
import { useEffect, useId, useState } from "react";
import {
  FieldRow,
  ListEditor,
  SelectField,
  SliderField,
  SwitchField,
  TextField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import type { FormProps } from "./form";
import {
  FORM_FIELD_LABELS,
  FORM_FIELD_TYPES,
  type FormField,
  type FormFieldType,
  MAX_CHOICE_OPTIONS,
  MAX_FORM_FIELDS,
  newFieldId,
} from "./form-fields";

/** A field of `type`, keeping the question, help text and required flag. */
function withType(field: FormField, type: FormFieldType): FormField {
  const base = {
    id: field.id,
    label: field.label,
    help: field.help,
    required: field.required,
  };
  switch (type) {
    case "text":
      return { ...base, type, multiline: false, maxLength: 500 };
    case "email":
    case "phone":
      return { ...base, type };
    case "stars":
      return { ...base, type, max: 5 };
    case "nps":
      return {
        ...base,
        type,
        lowLabel: "Not likely",
        highLabel: "Very likely",
      };
    case "choice":
      return {
        ...base,
        type,
        multiple: false,
        options:
          field.type === "choice" ? field.options : ["Option 1", "Option 2"],
      };
    case "consent":
      return { ...base, type };
  }
}

const newField = (): FormField => ({
  id: newFieldId(),
  type: "text",
  label: "",
  required: false,
  multiline: false,
  maxLength: 500,
});

const toOptions = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_CHOICE_OPTIONS);

/** One option per line; keeps the raw text (blank lines) while typing. */
function OptionsField({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  const id = useId();
  const [text, setText] = useState(options.join("\n"));
  useEffect(() => {
    setText((current) =>
      toOptions(current).join("\n") === options.join("\n")
        ? current
        : options.join("\n"),
    );
  }, [options]);
  const duplicates = new Set(options).size !== options.length;
  return (
    <FieldRow
      hint={
        duplicates
          ? "Two options are the same; make each one different."
          : `One option per line, up to ${MAX_CHOICE_OPTIONS}.`
      }
      htmlFor={id}
      label="Options"
    >
      <Textarea
        className="min-h-0 resize-y"
        id={id}
        onChange={(event) => {
          setText(event.target.value);
          onChange(toOptions(event.target.value));
        }}
        rows={Math.min(8, Math.max(3, options.length + 1))}
        value={text}
      />
    </FieldRow>
  );
}

function FieldSettings({
  field,
  update,
}: {
  field: FormField;
  update: (next: FormField) => void;
}) {
  const patch = (changes: Partial<FormField>) =>
    update({ ...field, ...changes } as FormField);
  return (
    <div className="space-y-3">
      <SelectField<FormFieldType>
        label="Type"
        onChange={(type) => update(withType(field, type))}
        options={FORM_FIELD_TYPES.map((type) => ({
          value: type,
          label: FORM_FIELD_LABELS[type],
        }))}
        value={field.type}
      />
      <TextField
        label={field.type === "consent" ? "Checkbox text" : "Question"}
        maxLength={200}
        onChange={(label) => patch({ label })}
        placeholder={
          field.type === "consent"
            ? "I agree to be contacted about my feedback"
            : "What did you think?"
        }
        value={field.label}
      />
      <TextField
        label="Help text"
        maxLength={300}
        onChange={(help) => patch({ help: help || undefined })}
        value={field.help}
      />
      {field.type === "text" && (
        <>
          <SwitchField
            checked={field.multiline}
            label="Long answer"
            onChange={(multiline) => patch({ multiline })}
          />
          <SliderField
            label="Max length"
            max={5000}
            min={50}
            onChange={(maxLength) => patch({ maxLength })}
            step={50}
            unit=" chars"
            value={field.maxLength}
          />
        </>
      )}
      {(field.type === "text" ||
        field.type === "email" ||
        field.type === "phone") && (
        <TextField
          label="Placeholder"
          maxLength={120}
          onChange={(placeholder) =>
            patch({ placeholder: placeholder || undefined })
          }
          value={field.placeholder}
        />
      )}
      {field.type === "stars" && (
        <SliderField
          label="Stars"
          max={10}
          min={3}
          onChange={(max) => patch({ max })}
          value={field.max}
        />
      )}
      {field.type === "nps" && (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Label at 0"
            maxLength={40}
            onChange={(lowLabel) => patch({ lowLabel })}
            value={field.lowLabel}
          />
          <TextField
            label="Label at 10"
            maxLength={40}
            onChange={(highLabel) => patch({ highLabel })}
            value={field.highLabel}
          />
        </div>
      )}
      {field.type === "choice" && (
        <>
          <SwitchField
            checked={field.multiple}
            hint="Checkboxes instead of a single choice"
            label="Allow several answers"
            onChange={(multiple) => patch({ multiple })}
          />
          <OptionsField
            onChange={(options) => patch({ options })}
            options={field.options}
          />
        </>
      )}
      <SwitchField
        checked={field.required}
        label="Required"
        onChange={(required) => patch({ required })}
      />
    </div>
  );
}

export function FormEditor({ value, onChange }: BlockEditorProps<FormProps>) {
  const set = (patch: Partial<FormProps>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <TextField
        label="Title"
        maxLength={120}
        onChange={(title) => set({ title })}
        value={value.title}
      />
      <TextField
        label="Intro"
        maxLength={1000}
        multiline
        onChange={(description) => set({ description })}
        rows={2}
        value={value.description}
      />
      <ListEditor<FormField>
        addLabel="Add question"
        create={newField}
        itemLabel={(field, index) =>
          `${index + 1}. ${field.label || FORM_FIELD_LABELS[field.type]}`
        }
        items={value.fields}
        label="Questions"
        max={MAX_FORM_FIELDS}
        onChange={(fields) => set({ fields })}
        renderItem={(field, update) => (
          <FieldSettings
            field={field}
            update={(next) => update(next as Partial<FormField>)}
          />
        )}
      />
      <TextField
        label="Button label"
        maxLength={40}
        onChange={(submitLabel) => set({ submitLabel })}
        value={value.submitLabel}
      />
      <TextField
        label="Thank-you message"
        maxLength={500}
        multiline
        onChange={(successMessage) => set({ successMessage })}
        rows={2}
        value={value.successMessage}
      />
      <p className="text-muted-foreground text-xs">
        Responses appear on this page's Responses screen. Visitors' answers are
        stored with the page; ask only for what you need, and say how you'll use
        contact details.
      </p>
    </div>
  );
}
