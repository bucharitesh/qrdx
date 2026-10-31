import { cn } from "@repo/design-system/lib/utils";
import {
  Flash as Flame,
  Tree as Leaf,
  Milk as MilkOff,
  Tree as Sprout,
  Reserve as UtensilsCrossed,
  Forbidden as WheatOff,
} from "iconsax-reactjs";
import type { ComponentType } from "react";
import { mutedTextClass, surfaceClass } from "@/components/landing/block-kit";
import { type BlockRenderProps, registerBlock } from "../registry";
import { MenuEditor } from "./menu-editor";
import {
  ALLERGEN_LABELS,
  DIET_LABELS,
  type DietTag,
  formatMenuPrice,
  type MenuItem,
  type MenuProps,
  type MenuSection,
  menuSchema,
} from "./menu-schema";

const DIET_ICONS: Partial<
  Record<DietTag, ComponentType<{ className?: string }>>
> = {
  vegetarian: Leaf,
  vegan: Leaf,
  "gluten-free": WheatOff,
  "dairy-free": MilkOff,
  spicy: Flame,
  organic: Sprout,
};

const pillClass =
  "inline-flex items-center gap-1 rounded-full bg-(--lp-fg)/8 px-2 py-0.5 text-xs font-medium";

function MenuItemRow({ item, currency }: { item: MenuItem; currency: string }) {
  const price =
    item.price === null ? null : formatMenuPrice(item.price, currency);
  return (
    <li className="flex gap-3 p-4">
      {item.image && (
        <img
          alt={item.image.alt}
          className={cn(
            "size-16 shrink-0 rounded-[calc(var(--lp-radius)*0.75)] bg-(--lp-fg)/5 object-cover",
            item.soldOut && "opacity-50 grayscale",
          )}
          decoding="async"
          height={64}
          loading="lazy"
          src={item.image.url}
          width={64}
        />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <p
            className={cn(
              "min-w-0 font-medium leading-snug",
              item.soldOut && "opacity-60",
            )}
          >
            {item.name}
          </p>
          {(price || item.priceNote) && (
            <p
              className={cn(
                "shrink-0 text-right font-medium tabular-nums",
                item.soldOut && "line-through opacity-60",
              )}
            >
              {price}
              {item.priceNote && (
                <span
                  className={cn(mutedTextClass, "ml-1 text-xs font-normal")}
                >
                  {item.priceNote}
                </span>
              )}
            </p>
          )}
        </div>
        {(item.soldOut || item.badge) && (
          <div className="flex flex-wrap gap-1.5">
            {item.soldOut && (
              <span className={cn(pillClass, "bg-(--lp-fg) text-(--lp-bg)")}>
                Sold out
              </span>
            )}
            {item.badge && (
              <span
                className={cn(
                  pillClass,
                  "bg-(--lp-primary) text-(--lp-primary-fg)",
                )}
              >
                {item.badge}
              </span>
            )}
          </div>
        )}
        {item.description && (
          <p className={cn(mutedTextClass, "whitespace-pre-line text-sm")}>
            {item.description}
          </p>
        )}
        {item.diet.length > 0 && (
          <ul
            aria-label="Dietary information"
            className="flex flex-wrap gap-1.5"
          >
            {item.diet.map((tag) => {
              const Icon = DIET_ICONS[tag];
              return (
                <li className={pillClass} key={tag}>
                  {Icon && <Icon aria-hidden="true" className="size-3" />}
                  {DIET_LABELS[tag]}
                </li>
              );
            })}
          </ul>
        )}
        {item.allergens.length > 0 && (
          <p className={cn(mutedTextClass, "text-xs")}>
            <span className="font-medium">Contains:</span>{" "}
            {item.allergens
              .map((allergen) => ALLERGEN_LABELS[allergen])
              .join(", ")}
          </p>
        )}
      </div>
    </li>
  );
}

export function MenuBlock({ id, props }: BlockRenderProps<MenuProps>) {
  const sections = props.sections.filter(
    (section) => section.items.length > 0 || section.name,
  );
  if (sections.length === 0) return null;
  const sectionId = (section: MenuSection) => `${id}-${section.id}`;
  const named = sections.filter((section) => section.name);

  return (
    <section aria-label={props.title || "Menu"} className="flex flex-col gap-5">
      {props.title && (
        <h2 className="text-xl font-semibold tracking-tight">{props.title}</h2>
      )}
      {props.showNav && named.length > 1 && (
        <nav aria-label="Menu sections">
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {named.map((section) => (
              <li className="shrink-0" key={section.id}>
                <a
                  className="block rounded-full bg-(--lp-muted) px-3.5 py-1.5 text-sm font-medium hover:brightness-95 focus-visible:outline-2 focus-visible:outline-(--lp-primary)"
                  href={`#${sectionId(section)}`}
                >
                  {section.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {sections.map((section) => (
        <section
          aria-labelledby={
            section.name ? `${sectionId(section)}-title` : undefined
          }
          className="scroll-mt-4 space-y-2"
          id={sectionId(section)}
          key={section.id}
        >
          {section.name && (
            <h3
              className="text-lg font-semibold tracking-tight"
              id={`${sectionId(section)}-title`}
            >
              {section.name}
            </h3>
          )}
          {section.description && (
            <p className={cn(mutedTextClass, "whitespace-pre-line text-sm")}>
              {section.description}
            </p>
          )}
          {section.items.length > 0 && (
            <ul className={cn(surfaceClass, "divide-y divide-(--lp-fg)/10")}>
              {section.items.map((item) => (
                <MenuItemRow
                  currency={props.currency}
                  item={item}
                  key={item.id}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
      {props.footnote && (
        <p className={cn(mutedTextClass, "whitespace-pre-line text-xs")}>
          {props.footnote}
        </p>
      )}
    </section>
  );
}

registerBlock({
  type: "menu",
  category: "commerce",
  label: "Menu",
  description:
    "Sections of dishes or products with prices, photos and allergens",
  icon: UtensilsCrossed,
  schema: menuSchema,
  defaults: {
    currency: "USD",
    sections: [
      {
        name: "Starters",
        items: [
          {
            name: "Tomato bruschetta",
            description: "Grilled sourdough, heirloom tomatoes, basil",
            price: 8,
            diet: ["vegan"],
            allergens: ["gluten"],
          },
        ],
      },
    ],
  },
  Render: MenuBlock,
  Editor: MenuEditor,
});
