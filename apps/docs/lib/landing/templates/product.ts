import { Box } from "iconsax-reactjs";
import { templatePhoto } from "./media";
import { registerTemplate } from "./registry";

// Product pages for a code on a pack, a label or a hang tag. The GTIN is
// left empty: it identifies a real product, and on a custom domain it makes
// https://<domain>/01/<GTIN> (GS1 Digital Link) open the page.

registerTemplate({
  type: "product",
  label: "Product",
  description:
    "Ingredients, nutrition, certifications and care for a product, with GS1 Digital Link",
  icon: Box,
  order: 45,
  variants: [
    {
      id: "food",
      name: "Food",
      description: "Ingredients, allergens and a nutrition table",
      theme: {
        colors: {
          background: "#faf6ee",
          foreground: "#231c12",
          primary: "#6b3f0e",
          primaryForeground: "#ffffff",
          muted: "#f1e9da",
          mutedForeground: "#5f5244",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 16,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            align: "left",
            cover: templatePhoto(
              "hero-honey",
              "A honey dipper resting in a jar of dark honey",
            ),
            eyebrow: "Raw wildflower honey · 340 g",
            title: "Meadow Hill Honey",
            size: "xl",
            subtitle:
              "Harvested by hand from our hives on the meadows above the valley.",
          },
        },
        {
          type: "product",
          props: {
            certifications: [
              { label: "Certified organic" },
              { label: "Non-GMO" },
              { label: "Gluten-free" },
            ],
            ingredients: "100% raw wildflower honey.",
            allergens: [],
            allergenNote: "Not suitable for babies under 12 months.",
            nutrition: {
              basis: "Per tablespoon (21 g)",
              rows: [
                { name: "Energy", value: "268 kJ / 64 kcal" },
                { name: "Fat", value: "0 g" },
                { name: "Carbohydrate", value: "17 g" },
                { name: "of which sugars", value: "17 g", sub: true },
                { name: "Protein", value: "0.1 g" },
                { name: "Salt", value: "0 g" },
              ],
            },
            sections: [
              {
                title: "Storing your honey",
                body: "Keep the jar at room temperature. Raw honey crystallizes over time: stand the jar in warm water to soften it again.",
              },
              {
                title: "Where it comes from",
                body: "Our forty hives sit on wildflower meadows. Every batch is extracted cold and strained once, never heated.",
              },
            ],
          },
        },
        {
          type: "details",
          props: {
            items: [
              { label: "Net weight", value: "340 g" },
              { label: "Best before", value: "Printed on the lid" },
              { label: "Batch", value: "Printed on the lid" },
            ],
          },
        },
        {
          type: "button",
          props: {
            label: "Shop more from our hives",
            url: "https://example.com/shop",
          },
        },
      ],
    },
    {
      id: "wine",
      name: "Wine & drinks",
      description: "An e-label: ingredients and energy per 100 ml",
      theme: {
        colors: {
          background: "#16100f",
          foreground: "#f4ede6",
          primary: "#e8c9a0",
          primaryForeground: "#16100f",
          muted: "#251b19",
          mutedForeground: "#b6a99e",
        },
        font: "dm-sans",
        headingFont: "cormorant",
        radius: 8,
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            cover: templatePhoto(
              "hero-vineyard",
              "Dark grapes hanging on the vine",
            ),
            eyebrow: "Pinot Noir · 2023 · 750 ml",
            title: "Cedar Ridge Estate",
            size: "xl",
            subtitle: "Bright cherry, forest floor and a long, silky finish.",
          },
        },
        {
          type: "details",
          props: {
            layout: "tiles",
            items: [
              { label: "Alcohol", value: "13.5% vol" },
              { label: "Serve at", value: "14–16 °C" },
              { label: "Grapes", value: "Pinot Noir" },
            ],
          },
        },
        {
          type: "product",
          props: {
            certifications: [
              { label: "Sustainably farmed" },
              { label: "Vegan" },
            ],
            ingredients:
              "Grapes, preservative (sulphites), acidity regulator (tartaric acid).",
            allergens: ["sulphites"],
            nutrition: {
              basis: "Per 100 ml",
              rows: [
                { name: "Energy", value: "349 kJ / 84 kcal" },
                { name: "Fat", value: "0 g" },
                { name: "Carbohydrate", value: "2.6 g" },
                { name: "of which sugars", value: "0.6 g", sub: true },
                { name: "Protein", value: "0 g" },
                { name: "Salt", value: "0 g" },
              ],
            },
            sections: [
              {
                title: "Food pairing",
                body: "Roast duck, mushroom risotto or an aged mountain cheese.",
              },
              {
                title: "Drink responsibly",
                body: "Don't drink and drive. Avoid alcohol when pregnant. Not for sale to anyone under the legal drinking age.",
              },
            ],
          },
        },
        {
          type: "button",
          props: {
            label: "Visit the winery",
            url: "https://example.com/visit",
            style: "outline",
          },
        },
      ],
    },
    {
      id: "beauty",
      name: "Beauty & care",
      description: "Full ingredient list, how to use and warnings",
      theme: {
        colors: {
          background: "#fbf7f5",
          foreground: "#2b2221",
          primary: "#2b2221",
          primaryForeground: "#fbf7f5",
          muted: "#f2eae6",
          mutedForeground: "#6a5c58",
        },
        font: "dm-sans",
        headingFont: "instrument-serif",
        radius: 20,
        buttonShape: "pill",
        spacing: "relaxed",
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Face serum · 30 ml",
            title: "Calm Skin Serum",
            size: "xl",
            subtitle:
              "A lightweight serum with niacinamide and oat for sensitive skin.",
          },
        },
        {
          type: "product",
          props: {
            certifications: [
              { label: "Cruelty-free" },
              { label: "Vegan" },
              { label: "Recyclable packaging" },
            ],
            ingredients:
              "Aqua, Glycerin, Niacinamide, Avena Sativa Kernel Extract, Panthenol, Sodium Hyaluronate, Xanthan Gum, Phenoxyethanol, Ethylhexylglycerin.",
            allergens: [],
            nutrition: { basis: "", rows: [] },
            sections: [
              {
                title: "How to use",
                body: "Smooth two or three drops over clean skin, morning and evening, before your moisturizer.",
              },
              {
                title: "Warnings",
                body: "For external use only. Avoid contact with the eyes. Stop using it if irritation occurs.",
              },
              {
                title: "Recycling",
                body: "Glass bottle and aluminium cap: recycle with glass. Dropper: general waste.",
              },
            ],
          },
        },
        {
          type: "details",
          props: {
            items: [
              { label: "Size", value: "30 ml" },
              { label: "Use within", value: "12 months of opening" },
              { label: "Made in", value: "Portugal" },
            ],
          },
        },
        {
          type: "button",
          props: {
            label: "Shop the routine",
            url: "https://example.com/routine",
          },
        },
      ],
    },
    {
      id: "passport",
      name: "Product passport",
      description: "Materials, origin, care, repair and recycling",
      theme: {
        colors: {
          background: "#f3f2ee",
          foreground: "#1a1a18",
          primary: "#1a1a18",
          primaryForeground: "#f3f2ee",
          muted: "#e7e5df",
          mutedForeground: "#58574f",
        },
        font: "dm-sans",
        headingFont: "space-grotesk",
        radius: 6,
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "banner",
            align: "left",
            cover: templatePhoto(
              "hero-knitwear",
              "A patterned knit wrap over a brown coat",
            ),
            eyebrow: "Product passport",
            title: "Merino Crew Sweater",
            size: "xl",
            subtitle: "Style 2207 · Oat melange",
          },
        },
        {
          type: "details",
          props: {
            title: "Where it was made",
            items: [
              { label: "Material", value: "100% merino wool" },
              { label: "Wool from", value: "New Zealand" },
              { label: "Spun and knitted", value: "Biella, Italy" },
              { label: "Sewn", value: "Porto, Portugal" },
              { label: "Weight", value: "380 g" },
            ],
          },
        },
        {
          type: "product",
          props: {
            certifications: [
              { label: "Mulesing-free wool" },
              { label: "Recyclable packaging" },
            ],
            ingredients: "",
            allergens: [],
            nutrition: { basis: "", rows: [] },
            sections: [
              {
                title: "Care",
                body: "Hand wash cold or use a wool cycle. Dry flat. Don't tumble dry or bleach.",
              },
              {
                title: "Repair",
                body: "Free repairs for the life of the sweater: holes, loose seams and worn cuffs.",
              },
              {
                title: "End of life",
                body: "Bring it back to any of our stores or post it to us. We resell, repair or recycle every piece.",
              },
            ],
          },
        },
        {
          type: "links",
          props: {
            style: "rows",
            icons: false,
            items: [
              {
                label: "Book a free repair",
                url: "https://example.com/repair",
              },
              {
                label: "Find a store",
                url: "https://example.com/stores",
              },
            ],
          },
        },
      ],
    },
  ],
});
