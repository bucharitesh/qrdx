import type { SeoGroup } from "../types";

export const products: SeoGroup = {
  id: "products",
  title: "Products and packaging",
  description:
    "Boxes, labels, manuals, stickers and merchandise that leave with the customer.",
  items: [
    {
      slug: "packaging",
      name: "Packaging",
      noun: "packaging",
      title: "QR codes on product packaging",
      seoTitle: "QR Codes on Packaging: Size, Placement, Content",
      metaDescription:
        "QR codes on product packaging: what to link to, how big to print on boxes and pouches, placement away from barcodes and folds, and print-ready export.",
      summary:
        "Setup guides, ingredients, reorders and registration from the box.",
      intro: [
        "Packaging is the one piece of marketing every customer is guaranteed to hold. A QR code on the box can do work the box can't: show a setup video, list full ingredients, register a warranty or reorder the product when it runs out.",
        "Packaging is also printed months ahead and in large runs. Use dynamic codes so a website change, a recipe change or a new campaign doesn't strand thousands of boxes with a dead link.",
      ],
      useCases: [
        {
          title: "Unboxing and setup",
          description:
            "A code on the inside flap that opens a setup or assembly video when the customer needs it.",
        },
        {
          title: "Product details",
          description:
            "Ingredients, sourcing, certifications and care instructions that don't fit on the pack.",
        },
        {
          title: "Reorder and subscribe",
          description:
            "Consumables like coffee, pet food or filters can link to the reorder page.",
        },
        {
          title: "Recycling instructions",
          description:
            "How to dispose of each part of the packaging in the customer's area.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic code per product line",
          why: "Survives website changes and lets you measure scans per SKU. Create codes in bulk from your product list via the API.",
        },
        {
          kind: "page",
          page: "video",
          why: "Setup and how-to videos, embedded or uploaded, on a page that loads fast on mobile data.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Warranty registration or product feedback with your own fields.",
        },
      ],
      distances: [
        { label: "Box in the hand", meters: 0.3 },
        { label: "Box on a store shelf", meters: 0.8 },
      ],
      tips: [
        "Keep the QR code well away from the retail barcode (EAN/UPC) so checkout scanners and customers don't scan the wrong one.",
        "Avoid folds, seams and the curved edges of pouches; place the code on a flat panel.",
        "Packaging printers want vector artwork: export SVG or a CMYK PDF, both free in QRdx.",
        "If you print on kraft or coloured board, test contrast; brown board needs solid black modules.",
      ],
      ctas: [
        "Scan for the 2-minute setup video",
        "Where this comes from",
        "Running low? Reorder in one scan",
        "How to recycle this pack",
      ],
      faqs: [
        {
          question: "How big should a QR code be on packaging?",
          answer:
            "For a box held in the hand, about 3.5 cm with a short link is comfortable. On shelf-facing panels read from further away, go larger. Always test on the printed proof.",
        },
        {
          question: "Can I put a QR code next to the barcode?",
          answer:
            "Keep them apart and clearly different, so checkout scanners and customers each read the right one. Some retailers are moving to 2D codes at the till using GS1 standards; that is a separate code with its own rules.",
        },
        {
          question:
            "What if my website changes after the packaging is printed?",
          answer:
            "With a dynamic code, change the destination in the dashboard and every box follows. A static code would keep pointing at the old address.",
        },
      ],
      related: ["manufacturing", "cosmetics", "wineries", "agriculture"],
      image: "productPackaging",
    },
    {
      slug: "labels",
      name: "Labels",
      noun: "labels",
      title: "QR codes on labels",
      seoTitle: "QR Codes on Product Labels: Size and Print Tips",
      metaDescription:
        "QR codes on product labels: minimum sizes for small labels, curved bottles and jars, label materials and inks, and what to link to from a label.",
      summary: "Small-label sizing, curved containers and durable label stock.",
      intro: [
        "Labels are where QR codes get small. A jar, a bottle or a cable tag leaves a few square centimetres, so the code has to be compact, which favours short dynamic links over long URLs encoded directly.",
        "Labels also go on curved, shiny or textured surfaces. Material choice and placement often matter more than the code itself.",
      ],
      useCases: [
        {
          title: "Food and drink labels",
          description:
            "Ingredients, allergens, recipes and the producer's story from a jar or bottle.",
        },
        {
          title: "Equipment and asset tags",
          description:
            "Manuals, service history and fault reporting from a label on the device.",
        },
        {
          title: "Handmade products",
          description:
            "Care instructions and the maker's shop from a hang tag or swing label.",
        },
        {
          title: "Batch information",
          description:
            "Batch-specific details for food, cosmetics or chemicals, one code per batch.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic short link",
          why: "A short link makes the smallest possible code. Repoint it when the product page changes.",
        },
        {
          kind: "page",
          page: "pdf",
          why: "Data sheets and instructions for asset tags, replaced when they're revised.",
        },
        {
          kind: "static",
          type: "etsy",
          why: "Hang tags for makers: open your Etsy shop or the listing for a matching product.",
        },
      ],
      distances: [
        { label: "Small jar or bottle", meters: 0.2 },
        { label: "Asset tag on equipment", meters: 0.3 },
      ],
      tips: [
        "On curved containers, keep the code narrow: on a jar about 6 cm across, a code 2 to 2.5 cm wide stays readable, while wider codes curve out of view.",
        "The minimum is set by module size: keep each module at least 0.4 mm. For a short link that is about 1.2 cm, but 2 cm or more scans far more easily.",
        "For labels exposed to water, oil or abrasion, use polyester or vinyl stock with thermal-transfer or laser printing.",
        "Avoid metallic, holographic or clear labels behind the code unless there is a solid white layer under it.",
      ],
      ctas: [
        "Scan for allergens and ingredients",
        "Manual and service history",
        "Care instructions",
        "Meet the maker",
      ],
      faqs: [
        {
          question: "What is the smallest QR code I can put on a label?",
          answer:
            "With a short link and 0.4 mm modules, about 1.2 cm wide, plus a quiet zone. That only works when the phone is very close; 2 to 2.5 cm is a safer minimum for labels read at 20 cm.",
        },
        {
          question: "Do QR codes work on round bottles?",
          answer:
            "Yes, if the code doesn't wrap too far around the curve. Keep it narrow, or put it on a flat neck tag or the base of a jar.",
        },
        {
          question: "Which QR code type is best for small labels?",
          answer:
            "A dynamic short link. The less data a code holds, the fewer modules it has and the bigger each module can be at the same size, which makes small codes scan better.",
        },
      ],
      related: ["wineries", "agriculture", "logistics", "pharma"],
    },
    {
      slug: "product-manuals",
      name: "Product manuals",
      noun: "product manuals",
      title: "QR codes in product manuals",
      seoTitle: "QR Codes in Product Manuals and Instructions",
      metaDescription:
        "QR codes in product manuals and quick-start guides: video instructions, translated manuals, spare parts, support and warranty, with print size tips.",
      summary:
        "Video steps, translations, spare parts and support from the manual.",
      intro: [
        "Printed manuals are written once and read under pressure: half-assembled furniture, a beeping appliance. A QR code next to a tricky step can open a video of exactly that step, and a code on the cover can open the manual in another language or the latest revision.",
        "Manuals stay with products for years, longer than most support websites stay the same. Dynamic codes keep the links working through redesigns and platform changes.",
      ],
      useCases: [
        {
          title: "Video for the hard step",
          description:
            "A small code beside step 7 that opens a 30-second clip of step 7.",
        },
        {
          title: "Other languages",
          description:
            "One code on the cover that opens the manual in the reader's language, instead of shipping 20 languages in print.",
        },
        {
          title: "Spare parts and accessories",
          description:
            "A code on the parts list that opens the spare-parts shop for that model.",
        },
        {
          title: "Support and troubleshooting",
          description:
            "Fault codes and fixes on a page you update as support learns, linked from the troubleshooting section.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "video",
          why: "Step videos per section, swapped when the product changes.",
        },
        {
          kind: "page",
          page: "pdf",
          why: "The full or translated manual as a PDF, replaced with each revision.",
        },
        {
          kind: "dynamic",
          label: "Dynamic link to support",
          why: "Points at the current support site or help centre, whatever platform you use next year.",
        },
      ],
      distances: [
        { label: "Quick-start sheet in the hand", meters: 0.3 },
        { label: "Manual open on a table", meters: 0.4 },
      ],
      tips: [
        "Put the code next to the step it explains, not on a 'resources' page at the end.",
        "Manuals are often printed in one colour on thin paper. Black codes at about 3.5 cm survive that well.",
        "Add the URL as text for readers who can't scan, especially in safety-related sections.",
        "Some products have legal requirements for printed safety information; keep those in print and use codes for extra help.",
      ],
      ctas: [
        "Stuck on this step? Watch it",
        "Manual in your language",
        "Order spare parts",
        "Troubleshooting and support",
      ],
      faqs: [
        {
          question: "Can a QR code replace the printed manual?",
          answer:
            "Partly. Safety information may legally need to be in print, depending on the product and market. Codes work best for videos, translations, updates and support.",
        },
        {
          question: "How do I keep manual links working for years?",
          answer:
            "Use dynamic codes. If your support site moves, change the destination and every printed manual keeps working.",
        },
        {
          question: "How many QR codes should a manual have?",
          answer:
            "One on the cover for the full manual and support, plus one beside each step that has a video. Separate codes show which steps cause the most trouble.",
        },
      ],
      related: ["manufacturing", "healthcare", "pharma", "construction"],
    },
    {
      slug: "stickers",
      name: "Stickers",
      noun: "stickers",
      title: "QR code stickers",
      seoTitle: "QR Code Stickers: Sizes, Materials and Uses",
      metaDescription:
        "QR code stickers for products, equipment, windows and events: which material to choose, sizes that scan, and dynamic codes you can repoint after printing.",
      summary:
        "Vinyl, paper or clear stickers that scan, and codes you can repoint.",
      intro: [
        "Stickers are the fastest way to add a QR code to something that already exists: a laptop, a machine, a shop counter, a product without a code on the pack. Ordering a roll of identical stickers is cheap, which makes dynamic codes the obvious choice: print one design and repoint it whenever you need.",
        "The sticker material decides whether it lasts a week or five years. Pick the stock for where it will live.",
      ],
      useCases: [
        {
          title: "Retrofit existing products",
          description:
            "Add a manual, support or reorder link to stock that was printed without a code.",
        },
        {
          title: "Equipment and IT assets",
          description:
            "Asset stickers that open service history, manuals or a fault form.",
        },
        {
          title: "Counters and tables",
          description:
            "Payment, menu or review stickers on counters, tables and doors.",
        },
        {
          title: "Swag and events",
          description:
            "Branded stickers that open your app, community or social profile.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "One dynamic design for the whole roll",
          why: "Print once, repoint the code whenever you need. Ideal for sticker runs where reprints are the expensive part.",
        },
        {
          kind: "static",
          type: "upi",
          why: "Counter payment stickers for UPI in India, free and static.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Fault-report stickers on equipment, one form per machine or room.",
        },
      ],
      distances: [
        { label: "Laptop or small device", meters: 0.3 },
        { label: "Counter or table sticker", meters: 0.5 },
        { label: "Door or window sticker", meters: 1 },
      ],
      tips: [
        "Use vinyl with a laminate outdoors or anywhere it gets wiped; paper stickers are for indoor, short-term use.",
        "Clear stickers need a white underprint behind the code, or the background shows through and kills contrast.",
        "Round stickers work, but keep the code square inside with a margin all round.",
        "Before sticking over an old code, make sure nothing else depends on it, and remove the old one.",
      ],
      ctas: [
        "Scan to pay",
        "Scan to report a problem",
        "Join our community",
        "Scan for the manual",
      ],
      faqs: [
        {
          question: "What size should a QR code sticker be?",
          answer:
            "For close-range scans (30 cm), about 3.5 cm with a short link. For door or window stickers read from a metre away, about 12 cm.",
        },
        {
          question: "Which sticker material lasts longest?",
          answer:
            "Laminated vinyl or polyester for outdoor and high-wear spots; paper for indoor, short-term use. UV-resistant inks keep outdoor codes dark.",
        },
        {
          question: "Can I reuse the same sticker for a different campaign?",
          answer:
            "Yes, if it's a dynamic code. Change the destination in the dashboard and the stickers already out there follow.",
        },
      ],
      related: ["food-trucks", "coffee-shops", "gyms", "logistics"],
    },
    {
      slug: "mugs",
      name: "Mugs and merchandise",
      noun: "mugs and merchandise",
      title: "QR codes on mugs and merchandise",
      seoTitle: "QR Codes on Mugs and Branded Merchandise",
      metaDescription:
        "QR codes on mugs, bottles, tote bags and branded merchandise: what to link to, sizing for curved surfaces, printing methods that scan and durability tips.",
      summary:
        "Curved-surface sizing, print methods and links that outlast the campaign.",
      intro: [
        "Branded mugs, bottles and tote bags last years, far longer than the campaign they were made for. A QR code on merchandise therefore needs to keep working long after the event, which only a dynamic code can promise: repoint it to whatever is current.",
        "Mugs and bottles are also curved and often glazed or metallic, so sizing and print method matter.",
      ],
      useCases: [
        {
          title: "Event and conference merch",
          description:
            "A mug or bottle that opens the event's recordings, community or next year's tickets.",
        },
        {
          title: "Café and roastery mugs",
          description:
            "Retail mugs that open your shop, subscription or brewing guides.",
        },
        {
          title: "Employee and client gifts",
          description:
            "Merch that opens your careers page, client portal or newsletter.",
        },
        {
          title: "Gifts with a message",
          description:
            "A personalised mug that opens a video message or photo album.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic code that outlives the campaign",
          why: "Merch stays in kitchens for years. Repoint the code as campaigns change so it never opens a dead page.",
        },
        {
          kind: "page",
          page: "video",
          why: "Personal video messages for gifts, or a brand video for promotional mugs.",
        },
        {
          kind: "page",
          page: "links",
          why: "Your shop, socials and newsletter on one page behind the printed code.",
        },
      ],
      distances: [
        { label: "Mug in the hand", meters: 0.3 },
        { label: "Mug on a desk", meters: 0.6 },
      ],
      tips: [
        "On a standard mug, keep the code under about 4 cm wide so it doesn't wrap around the curve.",
        "Dye-sublimation and screen printing give crisp, dark codes. Avoid light ceramic colours on white glaze.",
        "Gloss glaze reflects; test at a slight angle as people actually hold a mug.",
        "Dishwashers fade prints over time; choose dishwasher-safe processes and strong contrast.",
      ],
      ctas: [
        "Scan for our brewing guide",
        "A message for you",
        "See you next year: early tickets",
        "Shop the collection",
      ],
      faqs: [
        {
          question: "Will a QR code on a mug scan?",
          answer:
            "Yes, if it is printed dark on a light background and not too wide for the curve. Around 3.5 to 4 cm on a standard mug works with a short link.",
        },
        {
          question: "What should a merchandise QR code link to?",
          answer:
            "Something that stays useful: your shop, community or newsletter, rather than a one-off campaign page. With a dynamic code, you can change it later anyway.",
        },
        {
          question: "Do merchandise QR codes expire?",
          answer:
            "Static codes never do. QRdx dynamic codes keep redirecting on every plan, even after a downgrade or cancellation, so merch in circulation keeps working.",
        },
      ],
      related: ["coffee-shops", "events", "weddings", "marketing-agencies"],
    },
    {
      slug: "t-shirts",
      name: "T-shirts and apparel",
      noun: "t-shirts and apparel",
      title: "QR codes on t-shirts and apparel",
      seoTitle: "QR Codes on T-Shirts and Apparel",
      metaDescription:
        "QR codes on t-shirts, hoodies and staff uniforms: what to link to, print size for chest and back prints, fabrics and print methods that stay scannable.",
      summary:
        "Chest and back sizing, fabrics that scan and staff-uniform uses.",
      intro: [
        "A QR code on a t-shirt is a conversation starter at events, a recruiting tool on a staff uniform and a fundraising link on a charity run. It is also one of the hardest surfaces to scan: fabric stretches, folds and wrinkles.",
        "Big, simple codes printed in high contrast on flat areas of the garment work. Dynamic short links keep the code simple and let you repoint it after the run is printed.",
      ],
      useCases: [
        {
          title: "Event and team shirts",
          description:
            "A back print that opens the event page, the team's profile or the donation page for a charity run.",
        },
        {
          title: "Staff uniforms",
          description:
            "Uniforms that open your review page, careers page or tipping link.",
        },
        {
          title: "Merch for creators",
          description: "Shirts that open your channel, music or shop.",
        },
        {
          title: "Product care",
          description:
            "A code on the hang tag or inner label with care instructions and sizing.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic short link",
          why: "Fewer modules mean bigger modules at the same size, which survives fabric texture. Repoint it after the event.",
        },
        {
          kind: "static",
          type: "instagram",
          why: "Creators and brands: opens your Instagram profile from your username.",
        },
        {
          kind: "page",
          page: "links",
          why: "One page for socials, shop and events behind the printed code.",
        },
      ],
      distances: [
        { label: "Chest print, face to face", meters: 1 },
        { label: "Back print, behind in a queue", meters: 1.5 },
      ],
      tips: [
        "Print on flat areas: centre chest or upper back. Avoid seams, pockets and the curve under the arm.",
        "Size for the distance: about 12 cm on the chest for a metre away, about 17 cm on the back for 1.5 m.",
        "Screen printing and DTF give sharp, dark modules; embroidery is too coarse for most codes.",
        "Dark code on a light shirt works best. If you print light on dark, test it: not every scanner reads inverted codes.",
      ],
      ctas: [
        "Scan to sponsor me",
        "We're hiring",
        "Scan for the playlist",
        "Follow us",
      ],
      faqs: [
        {
          question: "Can you scan a QR code on a t-shirt?",
          answer:
            "Yes, if it is large, high contrast and on a flat part of the garment. Fabric stretch and wrinkles distort small codes, so keep it simple with a short link.",
        },
        {
          question: "Can a QR code be embroidered?",
          answer:
            "Only large, simple codes, and results vary. Stitch density can't reproduce fine modules reliably. Printing or heat transfer is much safer.",
        },
        {
          question: "Will a white QR code on a black shirt scan?",
          answer:
            "Most current phone cameras read inverted codes, but some older scanners don't. Test with several phones, or put the code on a light patch.",
        },
      ],
      related: ["nonprofits", "events", "marketing-agencies", "gyms"],
    },
  ],
};
