import { Health } from "iconsax-reactjs";
import { registerTemplate } from "./registry";

// Emergency information for a tag, wristband, helmet sticker or wallet
// card. Anyone who scans the code can read the page, so each template says
// so and asks only for what helps in an emergency.

registerTemplate({
  type: "medical",
  label: "Medical ID",
  description:
    "Emergency contacts and health notes for a tag, wristband or wallet card",
  icon: Health,
  order: 49,
  variants: [
    {
      id: "emergency",
      name: "Emergency info",
      description: "Conditions, allergies, medication and who to call",
      theme: {
        colors: {
          background: "#ffffff",
          foreground: "#141414",
          primary: "#b42318",
          primaryForeground: "#ffffff",
          muted: "#f4f4f4",
          mutedForeground: "#5c5c5c",
        },
        font: "dm-sans",
        headingFont: "dm-sans",
        radius: 12,
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Emergency information",
            title: "Jordan Lee",
            size: "xl",
            subtitle:
              "If I can't speak for myself, please read this and call my emergency contact.",
          },
        },
        {
          type: "button",
          props: {
            label: "Call my emergency contact",
            url: "tel:+15550119",
            note: "Alex Lee, partner",
          },
        },
        {
          type: "details",
          props: {
            items: [
              { label: "Conditions", value: "Type 1 diabetes" },
              { label: "Allergies", value: "Penicillin, bee stings" },
              { label: "Medication", value: "Insulin pump (left side)" },
              { label: "Blood type", value: "O+" },
            ],
          },
        },
        {
          type: "text",
          props: {
            heading: "If I seem confused or shaky",
            body: "My blood sugar may be low. Help me drink juice or a regular soda, then call my contact.",
            card: true,
          },
        },
        {
          type: "contact",
          props: {
            firstName: "Alex",
            lastName: "Lee",
            jobTitle: "Emergency contact · partner",
            company: "",
            phones: [{ type: "mobile", number: "+1 555 0119" }],
            showSave: false,
            showShare: false,
          },
        },
        {
          type: "text",
          props: {
            heading: "",
            body: "Anyone who scans this tag can read this page.",
            size: "sm",
            align: "center",
          },
        },
      ],
    },
    {
      id: "child",
      name: "Child's wristband",
      description: "For trips and festivals: who to call if a child is lost",
      theme: {
        colors: {
          background: "#f2f7fb",
          foreground: "#11202c",
          primary: "#1b5e8c",
          primaryForeground: "#ffffff",
          muted: "#e1ecf4",
          mutedForeground: "#4a5d6c",
        },
        font: "rounded",
        headingFont: "bricolage",
        radius: 20,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            eyebrow: "If I'm lost, please call my parents",
            title: "Mia, age 6",
            size: "xl",
            subtitle: "Please stay with me and call one of the numbers below.",
          },
        },
        {
          type: "button",
          props: {
            label: "Call Mom",
            url: "tel:+15550125",
          },
        },
        {
          type: "button",
          props: {
            label: "Call Dad",
            url: "tel:+15550126",
            style: "outline",
          },
        },
        {
          type: "details",
          props: {
            items: [
              { label: "Allergies", value: "Peanuts. EpiPen in her backpack" },
              { label: "Speaks", value: "English and Spanish" },
            ],
          },
        },
        {
          type: "text",
          props: {
            heading: "",
            body: "Anyone who scans this wristband can read this page.",
            size: "sm",
            align: "center",
          },
        },
      ],
    },
    {
      id: "allergy-card",
      name: "Allergy card",
      description: "Show it to restaurant staff when you eat out",
      theme: {
        colors: {
          background: "#fff8f1",
          foreground: "#1f1610",
          primary: "#1f1610",
          primaryForeground: "#fff8f1",
          muted: "#f6eadc",
          mutedForeground: "#62513f",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 14,
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Please show this to the chef",
            title: "I have a severe nut allergy",
            size: "xl",
            subtitle:
              "I can't eat peanuts or tree nuts, including oils, sauces and desserts made with them.",
          },
        },
        {
          type: "text",
          props: {
            heading: "Even a trace makes me very ill",
            body: "Please make sure my food doesn't touch pans, boards or fryers used for nuts. If you're not sure a dish is safe, please tell me. Thank you for checking!",
            card: true,
          },
        },
        {
          type: "text",
          props: {
            heading: "En español",
            body: "Tengo una alergia grave a los cacahuetes y a los frutos secos, incluidos aceites, salsas y postres hechos con ellos. Gracias por comprobarlo.",
          },
        },
        {
          type: "details",
          props: {
            items: [
              { label: "Allergic to", value: "Peanuts, tree nuts" },
              { label: "I carry", value: "An epinephrine auto-injector" },
            ],
          },
        },
      ],
    },
  ],
});
