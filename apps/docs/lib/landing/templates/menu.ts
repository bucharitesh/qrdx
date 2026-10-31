import { UtensilsCrossed } from "lucide-react";
import { themePreset } from "@/components/landing/theme";
import { registerTemplate } from "./registry";

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
      description: "Coffee and pastries, Wi-Fi and opening hours",
      theme: { colors: themePreset("sand"), font: "rounded", radius: 16 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Café Luna",
            subtitle: "Small-batch coffee and fresh pastries every morning.",
          },
        },
        {
          type: "menu",
          props: {
            currency: "USD",
            sections: [
              {
                name: "Coffee",
                items: [
                  { name: "Espresso", price: 3 },
                  { name: "Cappuccino", price: 4.5, allergens: ["milk"] },
                  {
                    name: "Flat white",
                    price: 4.5,
                    allergens: ["milk"],
                    badge: "Favorite",
                  },
                  {
                    name: "Oat milk",
                    price: 0.5,
                    priceNote: "extra",
                    diet: ["vegan"],
                  },
                ],
              },
              {
                name: "Pastries",
                items: [
                  {
                    name: "Butter croissant",
                    price: 3.5,
                    allergens: ["gluten", "milk", "eggs"],
                  },
                  {
                    name: "Banana bread",
                    description: "With walnuts, baked in house",
                    price: 4,
                    diet: ["vegetarian"],
                    allergens: ["gluten", "eggs", "nuts"],
                  },
                  {
                    name: "Almond cake",
                    price: 4.5,
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
            password: "coffee2go",
            security: "WPA",
          },
        },
        { type: "hours", props: { timezone: "" } },
      ],
    },
    {
      id: "restaurant",
      name: "Restaurant",
      description: "Starters, mains and desserts with dietary tags",
      theme: { colors: themePreset("graphite"), font: "serif", radius: 10 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Trattoria Verde",
            subtitle: "Seasonal Italian cooking. Tap a section to jump to it.",
          },
        },
        {
          type: "menu",
          props: {
            currency: "USD",
            sections: [
              {
                name: "Starters",
                items: [
                  {
                    name: "Burrata",
                    description: "Heirloom tomatoes, basil oil, sourdough",
                    price: 14,
                    diet: ["vegetarian"],
                    allergens: ["milk", "gluten"],
                  },
                  {
                    name: "Fritto misto",
                    description: "Calamari, prawns, lemon aioli",
                    price: 16,
                    allergens: ["molluscs", "crustaceans", "eggs", "gluten"],
                  },
                ],
              },
              {
                name: "Mains",
                items: [
                  {
                    name: "Wild mushroom risotto",
                    price: 22,
                    diet: ["vegetarian", "gluten-free"],
                    allergens: ["milk", "celery"],
                  },
                  {
                    name: "Spaghetti arrabbiata",
                    price: 18,
                    diet: ["vegan", "spicy"],
                    allergens: ["gluten"],
                  },
                  {
                    name: "Catch of the day",
                    description: "Ask your server",
                    price: null,
                    priceNote: "Market price",
                    allergens: ["fish"],
                    badge: "Chef's pick",
                  },
                ],
              },
              {
                name: "Desserts",
                items: [
                  {
                    name: "Tiramisu",
                    price: 9,
                    allergens: ["milk", "eggs", "gluten"],
                  },
                  {
                    name: "Lemon sorbet",
                    price: 7,
                    diet: ["vegan", "gluten-free"],
                  },
                ],
              },
            ],
            footnote:
              "Please tell your server about any allergies. A 10% service charge is added for groups of 8 or more.",
          },
        },
        { type: "hours", props: { timezone: "" } },
        {
          type: "address-map",
          props: {
            title: "Find us",
            name: "Trattoria Verde",
            address: {
              street: "48 Market Street",
              city: "San Francisco",
              region: "CA",
              postalCode: "94105",
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
      theme: { colors: themePreset("midnight"), radius: 12 },
      blocks: [
        {
          type: "header",
          props: {
            title: "The Copper Room",
            subtitle: "Happy hour every weekday, 5–7 pm.",
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
                    price: 13,
                  },
                  {
                    name: "Paloma",
                    description: "Tequila, grapefruit, lime, soda",
                    price: 12,
                    badge: "New",
                  },
                  {
                    name: "Garden spritz",
                    description: "Alcohol-free, elderflower and cucumber",
                    price: 8,
                    diet: ["vegan"],
                  },
                ],
              },
              {
                name: "Wine",
                items: [
                  {
                    name: "House red",
                    price: 9,
                    priceNote: "per glass",
                    allergens: ["sulphites"],
                  },
                  {
                    name: "House white",
                    price: 9,
                    priceNote: "per glass",
                    allergens: ["sulphites"],
                  },
                  {
                    name: "Prosecco",
                    price: 11,
                    priceNote: "per glass",
                    allergens: ["sulphites"],
                  },
                ],
              },
            ],
            footnote: "Please drink responsibly. ID required.",
          },
        },
        { type: "hours", props: { timezone: "" } },
      ],
    },
  ],
});
