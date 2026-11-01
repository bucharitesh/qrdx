"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { cn } from "@repo/design-system/lib/utils";
import { useEffect, useId, useState } from "react";
import {
  ChoiceField,
  FieldRow,
  ImageField,
  ListEditor,
  SelectField,
  SwitchField,
  TextField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import {
  ALLERGEN_LABELS,
  ALLERGENS,
  type Allergen,
  DIET_LABELS,
  DIET_TAGS,
  type DietTag,
  MAX_MENU_ITEMS,
  MAX_MENU_SECTIONS,
  type MenuItem,
  type MenuProps,
  type MenuSection,
} from "./menu-schema";

const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "INR",
  "CAD",
  "AUD",
  "NZD",
  "JPY",
  "CNY",
  "KRW",
  "SGD",
  "HKD",
  "AED",
  "SAR",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "TRY",
  "BRL",
  "MXN",
  "ZAR",
  "NGN",
  "IDR",
  "THB",
  "PHP",
  "MYR",
  "VND",
];

const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

const newItem = (): MenuItem => ({
  id: newId(),
  name: "",
  description: "",
  price: null,
  priceNote: "",
  diet: [],
  allergens: [],
  soldOut: false,
  badge: "",
});

const newSection = (): MenuSection => ({
  id: newId(),
  name: "",
  description: "",
  items: [newItem()],
});

const parsePrice = (text: string): number | null | undefined => {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
};

/** Decimal price input that keeps what's typed ("12.") until it's a number. */
function PriceField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => {
    setText((current) =>
      parsePrice(current) === value
        ? current
        : value === null
          ? ""
          : String(value),
    );
  }, [value]);
  const invalid = parsePrice(text) === undefined;
  return (
    <FieldRow
      hint={
        invalid ? "Enter a number, like 12.50" : "Leave empty to hide the price"
      }
      htmlFor={id}
      label="Price"
    >
      <Input
        aria-invalid={invalid || undefined}
        id={id}
        inputMode="decimal"
        maxLength={12}
        onChange={(event) => {
          setText(event.target.value);
          const next = parsePrice(event.target.value);
          if (next !== undefined) onChange(next);
        }}
        placeholder="12.50"
        value={text}
      />
    </FieldRow>
  );
}

function TagToggles<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T[];
  onChange: (value: T[]) => void;
}) {
  return (
    <fieldset className="min-w-0 space-y-1.5">
      <legend className="text-xs font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = value.includes(option);
          return (
            <button
              aria-pressed={selected}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
              key={option}
              onClick={() =>
                onChange(
                  selected
                    ? value.filter((current) => current !== option)
                    : options.filter(
                        (candidate) =>
                          candidate === option || value.includes(candidate),
                      ),
                )
              }
              type="button"
            >
              {labels[option]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ItemFields({
  item,
  update,
}: {
  item: MenuItem;
  update: (patch: Partial<MenuItem>) => void;
}) {
  return (
    <div className="space-y-3">
      <TextField
        label="Name"
        maxLength={120}
        onChange={(name) => update({ name })}
        placeholder="Margherita pizza"
        value={item.name}
      />
      <TextField
        label="Description"
        maxLength={500}
        multiline
        onChange={(description) => update({ description })}
        rows={2}
        value={item.description}
      />
      <div className="grid grid-cols-2 gap-3">
        <PriceField
          onChange={(price) => update({ price })}
          value={item.price}
        />
        <TextField
          hint="After the price"
          label="Price note"
          maxLength={40}
          onChange={(priceNote) => update({ priceNote })}
          placeholder="per glass"
          value={item.priceNote}
        />
      </div>
      <SwitchField
        checked={item.soldOut}
        hint="Stays on the menu, marked as sold out"
        label="Sold out"
        onChange={(soldOut) => update({ soldOut })}
      />
      <details className="group space-y-3">
        <summary className="text-muted-foreground cursor-pointer text-xs font-medium select-none">
          Photo, badge, dietary info and allergens
        </summary>
        <div className="space-y-3 pt-3">
          <ImageField
            label="Photo"
            onChange={(image) => update({ image })}
            value={item.image}
          />
          <TextField
            label="Badge"
            maxLength={30}
            onChange={(badge) => update({ badge })}
            placeholder="Chef's pick"
            value={item.badge}
          />
          <TagToggles<DietTag>
            label="Dietary"
            labels={DIET_LABELS}
            onChange={(diet) => update({ diet })}
            options={DIET_TAGS}
            value={item.diet}
          />
          <TagToggles<Allergen>
            label="Allergens"
            labels={ALLERGEN_LABELS}
            onChange={(allergens) => update({ allergens })}
            options={ALLERGENS}
            value={item.allergens}
          />
        </div>
      </details>
    </div>
  );
}

export function MenuEditor({ value, onChange }: BlockEditorProps<MenuProps>) {
  const set = (patch: Partial<MenuProps>) => onChange({ ...value, ...patch });
  const totalItems = value.sections.reduce(
    (total, section) => total + section.items.length,
    0,
  );
  const currencies = CURRENCIES.includes(value.currency)
    ? CURRENCIES
    : [value.currency, ...CURRENCIES];

  return (
    <div className="space-y-4">
      <TextField
        label="Title"
        maxLength={80}
        onChange={(title) => set({ title })}
        placeholder="Menu"
        value={value.title}
      />
      <SelectField
        label="Currency"
        onChange={(currency) => set({ currency })}
        options={currencies.map((code) => ({ value: code, label: code }))}
        value={value.currency}
      />
      <ChoiceField
        label="Style"
        onChange={(style) => set({ style })}
        options={[
          { value: "cards", label: "Cards" },
          {
            value: "classic",
            label: "Classic",
            title: "Like a printed menu, with dotted lines to the price",
          },
        ]}
        value={value.style}
      />
      <SwitchField
        checked={value.showNav}
        hint="Shortcut chips at the top when the menu has 2 or more sections"
        label="Section shortcuts"
        onChange={(showNav) => set({ showNav })}
      />
      <ListEditor<MenuSection>
        addLabel="Add section"
        create={newSection}
        itemLabel={(section, index) => section.name || `Section ${index + 1}`}
        items={value.sections}
        label="Sections"
        max={MAX_MENU_SECTIONS}
        onChange={(sections) => set({ sections })}
        renderItem={(section, updateSection) => (
          <div className="space-y-3">
            <TextField
              label="Section name"
              maxLength={80}
              onChange={(name) => updateSection({ name })}
              placeholder="Mains"
              value={section.name}
            />
            <TextField
              label="Section description"
              maxLength={300}
              multiline
              onChange={(description) => updateSection({ description })}
              rows={2}
              value={section.description}
            />
            <ListEditor<MenuItem>
              addLabel="Add item"
              create={newItem}
              itemLabel={(item, index) => item.name || `Item ${index + 1}`}
              items={section.items}
              label="Items"
              max={Math.max(
                section.items.length,
                MAX_MENU_ITEMS - totalItems + section.items.length,
              )}
              onChange={(items) => updateSection({ items })}
              renderItem={(item, update) => (
                <ItemFields item={item} update={update} />
              )}
            />
          </div>
        )}
      />
      <TextField
        hint="Allergen notice, service charge, opening hours…"
        label="Footnote"
        maxLength={500}
        multiline
        onChange={(footnote) => set({ footnote })}
        rows={2}
        value={value.footnote}
      />
    </div>
  );
}
