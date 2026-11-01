import { Reserve as UtensilsCrossed } from "iconsax-reactjs";
import { templatePhoto } from "./media";
import { registerTemplate } from "./registry";

/** Opening hours, Monday first: [open, close] or null when closed. */
const week = (...days: Array<[string, string] | null>) =>
  days.map((day) =>
    day ? { ranges: [{ open: day[0], close: day[1] }] } : { ranges: [] },
  );

registerTemplate({
  type: "menu",
  label: "Menu",
  description: "A digital menu with prices, allergens, opening hours and Wi-Fi",
  icon: UtensilsCrossed,
  order: 40,
  variants: [
    {
      id: "cafe",
      name: "Café",
      description: "Warm and classic: coffee, pastries, Wi-Fi and hours",
      theme: {
        colors: {
          background: "#f6f1ea",
          foreground: "#23180f",
          primary: "#3b2a1e",
          primaryForeground: "#f6f1ea",
          muted: "#ece3d6",
          mutedForeground: "#685645",
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
              "hero-latte",
              "A flat white with latte art on a wooden counter",
            ),
            eyebrow: "Coffee & bakery · Since 2014",
            title: "Café Luna",
            size: "xl",
            subtitle: "Small-batch coffee and pastries baked every morning.",
          },
        },
        {
          type: "menu",
          props: {
            style: "classic",
            currency: "USD",
            sections: [
              {
                name: "Coffee",
                items: [
                  { name: "Espresso", price: 3.25 },
                  {
                    name: "Flat white",
                    price: 4.75,
                    allergens: ["milk"],
                    badge: "Favourite",
                  },
                  { name: "Cortado", price: 4.25, allergens: ["milk"] },
                  {
                    name: "Pour-over",
                    description: "Ask for this week's single origin",
                    price: 5.5,
                  },
                  {
                    name: "Oat or almond milk",
                    price: 0.75,
                    priceNote: "extra",
                    diet: ["vegan"],
                  },
                ],
              },
              {
                name: "Bakery",
                items: [
                  {
                    name: "Butter croissant",
                    price: 3.75,
                    allergens: ["gluten", "milk", "eggs"],
                  },
                  {
                    name: "Cardamom bun",
                    description: "Our most-loved bake, out at 8 am",
                    price: 4.25,
                    diet: ["vegetarian"],
                    allergens: ["gluten", "milk", "eggs"],
                  },
                  {
                    name: "Banana bread",
                    description: "With walnuts and brown butter",
                    price: 4.5,
                    allergens: ["gluten", "eggs", "nuts", "milk"],
                  },
                  {
                    name: "Almond & orange cake",
                    price: 4.75,
                    diet: ["gluten-free"],
                    allergens: ["nuts", "eggs"],
                    soldOut: true,
                  },
                ],
              },
            ],
            footnote: "Ask us about allergens. We're happy to help.",
          },
        },
        {
          type: "wifi",
          props: {
            ssid: "CafeLuna-Guest",
            password: "moonlight2go",
            security: "WPA",
          },
        },
        {
          type: "hours",
          props: {
            days: week(
              ["07:00", "17:00"],
              ["07:00", "17:00"],
              ["07:00", "17:00"],
              ["07:00", "17:00"],
              ["07:00", "18:00"],
              ["08:00", "18:00"],
              ["08:00", "15:00"],
            ),
          },
        },
      ],
    },
    {
      id: "restaurant",
      name: "Restaurant",
      description: "Dark and elegant, a printed-menu look with bookings",
      theme: {
        colors: {
          background: "#12110f",
          foreground: "#f3ede2",
          primary: "#c9a96e",
          primaryForeground: "#12110f",
          muted: "#1e1c19",
          mutedForeground: "#aaa294",
        },
        font: "dm-sans",
        headingFont: "cormorant",
        radius: 6,
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            cover: templatePhoto(
              "hero-supper",
              "Small plates on a dark wooden table",
            ),
            eyebrow: "Cucina di stagione",
            title: "Trattoria Verde",
            size: "xl",
            subtitle: "Seasonal Italian cooking in North Beach.",
          },
        },
        {
          type: "button",
          props: {
            label: "Book a table",
            url: "https://example.com/reservations",
            note: "Walk-ins welcome at the bar",
          },
        },
        {
          type: "menu",
          props: {
            style: "classic",
            currency: "USD",
            sections: [
              {
                name: "Antipasti",
                items: [
                  {
                    name: "Burrata",
                    description:
                      "Heirloom tomatoes, basil oil, grilled sourdough",
                    price: 16,
                    diet: ["vegetarian"],
                    allergens: ["milk", "gluten"],
                  },
                  {
                    name: "Fritto misto",
                    description: "Calamari, prawns, lemon aioli",
                    price: 19,
                    allergens: ["molluscs", "crustaceans", "eggs", "gluten"],
                  },
                ],
              },
              {
                name: "Primi",
                items: [
                  {
                    name: "Cacio e pepe",
                    description: "Tonnarelli, pecorino romano, black pepper",
                    price: 22,
                    diet: ["vegetarian"],
                    allergens: ["gluten", "milk", "eggs"],
                    badge: "House favourite",
                  },
                  {
                    name: "Wild mushroom risotto",
                    price: 26,
                    diet: ["vegetarian", "gluten-free"],
                    allergens: ["milk", "celery"],
                  },
                ],
              },
              {
                name: "Secondi",
                items: [
                  {
                    name: "Catch of the day",
                    description: "Salsa verde, roasted fennel",
                    price: null,
                    priceNote: "Market price",
                    allergens: ["fish"],
                  },
                  {
                    name: "Pollo al mattone",
                    description: "Half chicken, rosemary potatoes",
                    price: 31,
                    diet: ["gluten-free"],
                  },
                ],
              },
              {
                name: "Dolci",
                items: [
                  {
                    name: "Tiramisù",
                    price: 11,
                    allergens: ["milk", "eggs", "gluten"],
                  },
                  {
                    name: "Blood orange sorbetto",
                    price: 9,
                    diet: ["vegan", "gluten-free"],
                  },
                ],
              },
            ],
            footnote:
              "Please tell us about any allergies. A 20% service charge is added for groups of 8 or more.",
          },
        },
        {
          type: "hours",
          props: {
            days: week(
              null,
              ["17:30", "22:00"],
              ["17:30", "22:00"],
              ["17:30", "22:30"],
              ["17:30", "23:00"],
              ["17:00", "23:00"],
              ["17:00", "21:30"],
            ),
          },
        },
        {
          type: "address-map",
          props: {
            title: "Find us",
            name: "Trattoria Verde",
            address: {
              street: "1450 Grant Avenue",
              city: "San Francisco",
              region: "CA",
              postalCode: "94133",
              country: "USA",
            },
          },
        },
      ],
    },
    {
      id: "bar",
      name: "Bar & drinks",
      description: "Cocktails, wine by the glass and happy hour",
      theme: {
        colors: {
          background: "#0f1513",
          foreground: "#efe9df",
          primary: "#d6935f",
          primaryForeground: "#0f1513",
          muted: "#19221f",
          mutedForeground: "#a3a99f",
        },
        font: "dm-sans",
        headingFont: "instrument-serif",
        radius: 12,
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            align: "left",
            cover: templatePhoto("hero-bar", "A busy bar counter at night"),
            eyebrow: "Happy hour · Weekdays 5–7 pm",
            title: "The Copper Room",
            size: "xl",
            subtitle: "Classic cocktails and natural wine since 2016.",
          },
        },
        {
          type: "menu",
          props: {
            currency: "USD",
            sections: [
              {
                name: "Cocktails",
                items: [
                  {
                    name: "Negroni",
                    description: "Gin, Campari, sweet vermouth",
                    price: 14,
                  },
                  {
                    name: "Paloma",
                    description: "Tequila, grapefruit, lime, soda",
                    price: 13,
                    badge: "New",
                  },
                  {
                    name: "Copper Old Fashioned",
                    description: "Bourbon, demerara, orange bitters",
                    price: 15,
                  },
                  {
                    name: "Garden spritz",
                    description: "Alcohol-free: elderflower, cucumber, soda",
                    price: 9,
                    diet: ["vegan"],
                  },
                ],
              },
              {
                name: "Wine",
                items: [
                  {
                    name: "Grüner Veltliner",
                    description: "Austria, crisp and peppery",
                    price: 12,
                    priceNote: "glass",
                    allergens: ["sulphites"],
                  },
                  {
                    name: "Skin-contact Pinot Gris",
                    description: "Oregon, orange wine",
                    price: 14,
                    priceNote: "glass",
                    allergens: ["sulphites"],
                  },
                  {
                    name: "Cabernet Franc",
                    description: "Loire, light and bright",
                    price: 13,
                    priceNote: "glass",
                    allergens: ["sulphites"],
                  },
                ],
              },
              {
                name: "Snacks",
                items: [
                  {
                    name: "Gordal olives",
                    price: 6,
                    diet: ["vegan", "gluten-free"],
                  },
                  {
                    name: "Fries, aioli",
                    price: 8,
                    diet: ["vegetarian"],
                    allergens: ["eggs"],
                  },
                ],
              },
            ],
            footnote: "Please drink responsibly. ID required.",
          },
        },
        {
          type: "hours",
          props: {
            days: week(
              ["17:00", "23:00"],
              ["17:00", "23:00"],
              ["17:00", "23:00"],
              ["17:00", "00:00"],
              ["17:00", "01:00"],
              ["16:00", "01:00"],
              null,
            ),
          },
        },
      ],
    },
    {
      id: "juice-bar",
      name: "Juice bar",
      description: "Bright and modern, with a photo for every item",
      theme: {
        colors: {
          background: "#fbfaf6",
          foreground: "#141414",
          primary: "#141414",
          primaryForeground: "#fbfaf6",
          muted: "#f1efe8",
          mutedForeground: "#5c5b54",
        },
        font: "dm-sans",
        headingFont: "bricolage",
        radius: 20,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Juice & smoothie bar",
            title: "Pressed.",
            size: "xl",
            subtitle: "Cold-pressed every morning. No added sugar, ever.",
          },
        },
        {
          type: "menu",
          props: {
            currency: "USD",
            sections: [
              {
                name: "Smoothies",
                items: [
                  {
                    name: "Berry good",
                    description: "Strawberry, raspberry, banana, oat milk",
                    price: 9,
                    image: templatePhoto("item-strawberries", "Strawberries"),
                    diet: ["vegan"],
                    badge: "Bestseller",
                  },
                  {
                    name: "Pink cloud",
                    description: "Raspberry, coconut yoghurt, dates",
                    price: 9.5,
                    image: templatePhoto("item-raspberries", "Raspberries"),
                    diet: ["vegan", "gluten-free"],
                  },
                  {
                    name: "Purple reign",
                    description: "Black grape, blueberry, chia, apple",
                    price: 9.5,
                    image: templatePhoto("item-grapes", "Black grapes"),
                    diet: ["vegan"],
                  },
                ],
              },
              {
                name: "Cold-pressed juice",
                items: [
                  {
                    name: "Sunrise",
                    description: "Orange, carrot, turmeric, ginger",
                    price: 8,
                    image: templatePhoto("item-oranges", "Oranges on a tree"),
                    diet: ["vegan", "gluten-free"],
                  },
                  {
                    name: "Tropic",
                    description: "Pineapple, mint, lime",
                    price: 8,
                    image: templatePhoto("item-pineapple", "A pineapple"),
                    diet: ["vegan", "gluten-free"],
                  },
                ],
              },
              {
                name: "Bowls",
                items: [
                  {
                    name: "Yoghurt bowl",
                    description: "Greek yoghurt, strawberries, honey granola",
                    price: 11,
                    image: templatePhoto(
                      "item-yogurt-bowl",
                      "Yoghurt with strawberries",
                    ),
                    diet: ["vegetarian"],
                    allergens: ["milk", "gluten", "nuts"],
                  },
                  {
                    name: "Garden bowl",
                    description: "Quinoa, roasted beets, greens, tahini",
                    price: 13,
                    image: templatePhoto(
                      "item-garden-bowl",
                      "A colourful bowl",
                    ),
                    diet: ["vegan"],
                    allergens: ["sesame"],
                  },
                ],
              },
            ],
          },
        },
        {
          type: "hours",
          props: {
            days: week(
              ["07:30", "18:00"],
              ["07:30", "18:00"],
              ["07:30", "18:00"],
              ["07:30", "18:00"],
              ["07:30", "18:00"],
              ["09:00", "17:00"],
              ["09:00", "15:00"],
            ),
          },
        },
        {
          type: "socials",
          props: {
            items: [
              { network: "instagram", url: "https://instagram.com/" },
              { network: "tiktok", url: "https://tiktok.com/" },
            ],
          },
        },
      ],
    },
  ],
});
