import { Tick } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown2, Box } from "iconsax-reactjs";
import { useLocale, useTranslations } from "next-intl";
import { mutedTextClass, surfaceClass } from "@/components/landing/block-kit";
import { LpHeading } from "@/components/landing/heading";
import { type BlockRenderProps, registerBlock } from "../registry";
import { ProductEditor } from "./product-editor";
import { formatGtin, type ProductProps, productSchema } from "./product-schema";

function ProductBlock({ id, props, context }: BlockRenderProps<ProductProps>) {
  const t = useTranslations("scanPages.hosted");
  const locale = useLocale();
  const nutrition = props.nutrition.rows.filter((row) => row.value);
  const hasContent =
    props.certifications.length > 0 ||
    props.ingredients ||
    props.allergens.length > 0 ||
    props.allergenNote ||
    nutrition.length > 0 ||
    props.sections.length > 0 ||
    (props.showGtin && props.gtin);
  if (!hasContent) return null;

  // Headings sit under the block's own title when it has one.
  const Sub = props.title ? "h3" : "h2";
  const subHeading = "text-base font-semibold";
  const titleId = `${id}-title`;

  return (
    <section
      aria-label={props.title ? undefined : t("product.details")}
      aria-labelledby={props.title ? titleId : undefined}
      className="space-y-4"
    >
      {props.title && (
        <LpHeading
          as="h2"
          className="text-lg font-semibold tracking-tight"
          id={titleId}
          preview={context.thumbnail}
        >
          {props.title}
        </LpHeading>
      )}

      {props.certifications.length > 0 && (
        <ul
          aria-label={t("product.certifications")}
          className="flex flex-wrap gap-2"
        >
          {props.certifications.map((item) => (
            <li
              className="inline-flex items-center gap-1.5 rounded-full bg-(--lp-muted) px-3 py-1.5 text-sm font-medium"
              key={item.id}
            >
              <Tick aria-hidden="true" className="size-3.5" />
              {item.label}
            </li>
          ))}
        </ul>
      )}

      {(props.ingredients ||
        props.allergens.length > 0 ||
        props.allergenNote) && (
        <div className={cn(surfaceClass, "space-y-2 p-5")}>
          <LpHeading
            as={Sub}
            className={subHeading}
            preview={context.thumbnail}
          >
            {props.ingredients
              ? t("product.ingredients")
              : t("product.allergens")}
          </LpHeading>
          {props.ingredients && (
            <p className="text-[15px] leading-relaxed whitespace-pre-line break-words">
              {props.ingredients}
            </p>
          )}
          {props.allergens.length > 0 && (
            <p className="text-sm">
              {t.rich("menu.contains", {
                label: (chunks) => (
                  <span className="font-semibold">{chunks}</span>
                ),
                list: new Intl.ListFormat(locale, {
                  style: "short",
                  type: "unit",
                }).format(
                  props.allergens.map((allergen) =>
                    t(`menu.allergens.${allergen}`),
                  ),
                ),
              })}
            </p>
          )}
          {props.allergenNote && (
            <p className={cn(mutedTextClass, "text-sm")}>
              {props.allergenNote}
            </p>
          )}
        </div>
      )}

      {nutrition.length > 0 && (
        <div className={cn(surfaceClass, "p-5")}>
          <div className="flex items-baseline justify-between gap-3 pb-2">
            <LpHeading
              as={Sub}
              className={subHeading}
              preview={context.thumbnail}
            >
              {t("product.nutrition")}
            </LpHeading>
            {props.nutrition.basis && (
              <p className={cn(mutedTextClass, "text-right text-sm")}>
                {props.nutrition.basis}
              </p>
            )}
          </div>
          <table className="w-full border-collapse text-[15px]">
            <caption className="sr-only">
              {props.nutrition.basis
                ? t("product.nutritionPer", { basis: props.nutrition.basis })
                : t("product.nutrition")}
            </caption>
            <tbody>
              {nutrition.map((row) => (
                <tr
                  className="border-t border-(--lp-fg)/10 first:border-t-2 first:border-(--lp-fg)/25"
                  key={row.id}
                >
                  <th
                    className={cn(
                      "py-2 text-left font-normal",
                      row.sub ? cn(mutedTextClass, "pl-4") : "font-medium",
                    )}
                    scope="row"
                  >
                    {row.name}
                  </th>
                  <td className="py-2 text-right tabular-nums">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {props.sections.length > 0 && (
        <div className={cn(surfaceClass, "divide-y divide-(--lp-fg)/10")}>
          {props.sections.map((section) => (
            <details className="group" key={section.id}>
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--lp-primary) [&::-webkit-details-marker]:hidden">
                {section.title}
                <ArrowDown2
                  aria-hidden="true"
                  className="size-4 shrink-0 transition-transform group-open:rotate-180"
                />
              </summary>
              {section.body && (
                <p className="px-5 pb-4 text-[15px] leading-relaxed whitespace-pre-line break-words">
                  {section.body}
                </p>
              )}
            </details>
          ))}
        </div>
      )}

      {props.showGtin && props.gtin && (
        <p className={cn(mutedTextClass, "text-center text-xs tabular-nums")}>
          GTIN {formatGtin(props.gtin)}
        </p>
      )}
    </section>
  );
}

export const productBlock = registerBlock({
  type: "product",
  category: "commerce",
  label: "Product details",
  description:
    "Ingredients, allergens, nutrition, certifications and care, with the GTIN",
  icon: Box,
  schema: productSchema,
  defaults: {
    ingredients: "Oats, almonds, honey, sunflower seeds, sea salt.",
    allergens: ["nuts"],
    nutrition: {
      basis: "Per 100 g",
      rows: [
        { id: "energy", name: "Energy", value: "1,850 kJ / 442 kcal" },
        { id: "fat", name: "Fat", value: "18 g" },
        { id: "carbs", name: "Carbohydrate", value: "58 g" },
        { id: "sugars", name: "of which sugars", value: "16 g", sub: true },
        { id: "protein", name: "Protein", value: "11 g" },
      ],
    },
  },
  Render: ProductBlock,
  Editor: ProductEditor,
});
