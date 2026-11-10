"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Add, Copy, CopySuccess } from "iconsax-reactjs";
import { useAvailability } from "@/components/availability-provider";
import { newItemId } from "@/components/landing/block-kit";
import {
  ListEditor,
  SwitchField,
  TextField,
} from "@/components/landing/editor/fields";
import { digitalLinkUri, gtinProblem } from "@/lib/gs1/digital-link";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-clipboard";
import type { BlockEditorProps } from "../registry";
import { TagToggles } from "./menu-editor";
import { ALLERGEN_LABELS, ALLERGENS } from "./menu-schema";
import {
  CERTIFICATION_SUGGESTIONS,
  MAX_CERTIFICATIONS,
  MAX_NUTRITION_ROWS,
  MAX_PRODUCT_SECTIONS,
  type NutritionRow,
  type ProductCertification,
  type ProductProps,
  type ProductSection,
} from "./product-schema";

/** Where the GTIN leads: the Digital Link on a custom domain, or why not. */
function DigitalLinkHint({
  gtin,
  customDomain,
}: {
  gtin: string;
  customDomain: string | null | undefined;
}) {
  const domainsAvailable = useAvailability().has("customDomains");
  if (!customDomain) {
    return (
      <p className="text-muted-foreground text-xs">
        Here this page's QR code uses its short link: GTINs only open pages on
        your own domain, so nobody can claim another brand's product.
        {domainsAvailable &&
          " Move the code to a custom domain to also open the page from a GS1 Digital Link (https://your-domain/01/<GTIN>)."}
      </p>
    );
  }
  if (!gtin || gtinProblem(gtin)) {
    return (
      <p className="text-muted-foreground text-xs">
        Add the product's GTIN and, once published, https://{customDomain}
        /01/&lt;GTIN&gt; opens this page.
      </p>
    );
  }
  const uri = digitalLinkUri(customDomain, gtin);
  return <DigitalLinkCopy uri={uri} />;
}

function DigitalLinkCopy({ uri }: { uri: string }) {
  const { copyToClipboard, hasCopied } = useCopyToClipboard();
  return (
    <div className="bg-muted/40 space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium">GS1 Digital Link</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-xs">{uri}</code>
        <Button
          aria-label="Copy GS1 Digital Link"
          className="size-7"
          onClick={() =>
            copyToClipboard(uri, {
              title: "GS1 Digital Link copied",
              description: uri,
            })
          }
          size="icon"
          type="button"
          variant="ghost"
        >
          {hasCopied ? <CopySuccess /> : <Copy />}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Opens this page once published, and counts as a scan of its code. Use
        this link as the QR code's content on your packaging.
      </p>
    </div>
  );
}

export function ProductEditor({
  value,
  onChange,
  context,
}: BlockEditorProps<ProductProps>) {
  const set = (patch: Partial<ProductProps>) =>
    onChange({ ...value, ...patch });
  const setNutrition = (patch: Partial<ProductProps["nutrition"]>) =>
    set({ nutrition: { ...value.nutrition, ...patch } });
  const certified = new Set(
    value.certifications.map((item) => item.label.toLowerCase()),
  );
  const suggestions = CERTIFICATION_SUGGESTIONS.filter(
    (label) => !certified.has(label.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <TextField
        label="Heading"
        maxLength={120}
        onChange={(title) => set({ title })}
        placeholder="Optional, e.g. About this product"
        value={value.title}
      />

      <div className="space-y-2">
        <TextField
          hint="The number under the product's barcode: 8, 12, 13 or 14 digits."
          inputMode="numeric"
          label="GTIN (barcode number)"
          maxLength={32}
          onChange={(gtin) => set({ gtin })}
          placeholder="Optional"
          value={value.gtin}
        />
        <DigitalLinkHint
          customDomain={context.customDomain}
          gtin={value.gtin}
        />
        <SwitchField
          checked={value.showGtin}
          label="Show the GTIN on the page"
          onChange={(showGtin) => set({ showGtin })}
        />
      </div>

      <div className="space-y-2">
        <ListEditor<ProductCertification>
          addLabel="Add certification"
          create={() => ({ id: newItemId(), label: "" })}
          itemLabel={(item, index) =>
            item.label || `Certification ${index + 1}`
          }
          items={value.certifications}
          label="Certifications and labels"
          max={MAX_CERTIFICATIONS}
          onChange={(certifications) => set({ certifications })}
          renderItem={(item, update) => (
            <TextField
              label="Label"
              maxLength={60}
              onChange={(label) => update({ label })}
              placeholder="Certified organic"
              value={item.label}
            />
          )}
        />
        {suggestions.length > 0 &&
          value.certifications.length < MAX_CERTIFICATIONS && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((label) => (
                <Button
                  className="h-7 rounded-full px-2.5 text-xs"
                  key={label}
                  onClick={() =>
                    set({
                      certifications: [
                        ...value.certifications,
                        { id: newItemId(), label },
                      ],
                    })
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Add className="size-3.5" />
                  {label}
                </Button>
              ))}
            </div>
          )}
      </div>

      <TextField
        hint="Line breaks are kept."
        label="Ingredients or materials"
        maxLength={3000}
        multiline
        onChange={(ingredients) => set({ ingredients })}
        rows={4}
        value={value.ingredients}
      />
      <TagToggles
        label="Contains allergens"
        labels={ALLERGEN_LABELS}
        onChange={(allergens) => set({ allergens })}
        options={ALLERGENS}
        value={value.allergens}
      />
      <TextField
        label="Allergen note"
        maxLength={200}
        onChange={(allergenNote) => set({ allergenNote })}
        placeholder="May contain traces of peanuts"
        value={value.allergenNote}
      />

      <div className="space-y-2">
        <p className="text-xs font-medium">Nutrition</p>
        <TextField
          label="Values are"
          maxLength={60}
          onChange={(basis) => setNutrition({ basis })}
          placeholder="Per 100 g"
          value={value.nutrition.basis}
        />
        <ListEditor<NutritionRow>
          addLabel="Add nutrient"
          create={() => ({ id: newItemId(), name: "", value: "", sub: false })}
          itemLabel={(row, index) => row.name || `Nutrient ${index + 1}`}
          items={value.nutrition.rows}
          max={MAX_NUTRITION_ROWS}
          onChange={(rows) => setNutrition({ rows })}
          renderItem={(row, update) => (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Nutrient"
                  maxLength={60}
                  onChange={(name) => update({ name })}
                  placeholder="Protein"
                  value={row.name}
                />
                <TextField
                  label="Amount"
                  maxLength={60}
                  onChange={(next) => update({ value: next })}
                  placeholder="11 g"
                  value={row.value}
                />
              </div>
              <SwitchField
                checked={row.sub}
                label="Indent under the row above"
                onChange={(sub) => update({ sub })}
              />
            </div>
          )}
        />
      </div>

      <ListEditor<ProductSection>
        addLabel="Add section"
        create={() => ({ id: newItemId(), title: "", body: "" })}
        itemLabel={(section, index) => section.title || `Section ${index + 1}`}
        items={value.sections}
        label="More information (opens on tap)"
        max={MAX_PRODUCT_SECTIONS}
        onChange={(sections) => set({ sections })}
        renderItem={(section, update) => (
          <>
            <TextField
              label="Title"
              maxLength={80}
              onChange={(title) => update({ title })}
              placeholder="Care, Recycling, Origin..."
              value={section.title}
            />
            <TextField
              label="Text"
              maxLength={3000}
              multiline
              onChange={(body) => update({ body })}
              rows={3}
              value={section.body}
            />
          </>
        )}
      />
    </div>
  );
}
