import type { SeoGroup } from "../types";

export const inStore: SeoGroup = {
  id: "in-store",
  title: "In-store and hospitality",
  description:
    "Menus, table tents, receipts, shelves and windows where customers already are.",
  items: [
    {
      slug: "menus",
      name: "Menus",
      noun: "menus",
      title: "QR code menus",
      seoTitle: "QR Code Menus: Digital Menus You Can Edit Anytime",
      metaDescription:
        "Create a QR code menu you can update without reprinting: hosted menu pages with prices, photos, allergens and sold-out items, plus table sizes and tips.",
      summary:
        "Hosted menus with prices, allergens and sold-out items, edited live.",
      intro: [
        "A QR code menu is only as good as what it opens. A static code linking to a PDF looks fine on day one, then breaks when the file is renamed and can't show that the salmon sold out at 8 pm. A hosted menu page behind a dynamic code can do both: edit an item from your phone and every table sees it on the next scan.",
        "Guests scan menus at the table, often in low light, sometimes with a weak signal. A good QR menu loads in a second, reads well on a small screen and keeps allergen information clear.",
      ],
      useCases: [
        {
          title: "Daily specials",
          description:
            "Add today's specials in the morning and remove them at close; the table code never changes.",
        },
        {
          title: "Sold-out items",
          description:
            "Mark a dish sold out so guests stop ordering it, and staff stop apologising.",
        },
        {
          title: "Allergens and diets",
          description:
            "Allergen and diet tags (vegan, gluten-free) per dish, which are easier to keep accurate than a printed key.",
        },
        {
          title: "Separate menus by time",
          description:
            "Breakfast, lunch and dinner menus behind the same code; on Pro, time-based routing switches them automatically.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "menu",
          why: "Sections, prices, photos, allergen and diet tags, sold-out flags, hours and a Wi-Fi block, edited in the dashboard.",
        },
        {
          kind: "page",
          page: "pdf",
          why: "If you already have a designed PDF menu, host it so you can replace the file without changing the code.",
        },
        {
          kind: "static",
          type: "wifi",
          why: "A Wi-Fi code beside the menu code helps guests with weak mobile signal load the menu.",
        },
      ],
      distances: [
        { label: "Menu card on the table", meters: 0.4 },
        { label: "Wall or counter menu", meters: 1.5 },
      ],
      tips: [
        "Stand the code up on a holder or tent so guests don't need to lean over the table.",
        "Matte laminate avoids glare from pendant lights.",
        "Keep a few printed menus for guests who prefer paper or don't have a phone.",
        "Use a separate code for each area (bar, terrace, delivery) to compare scans.",
      ],
      ctas: [
        "Scan for our menu and today's specials",
        "Menu, allergens and drinks",
        "Order from your table",
      ],
      faqs: [
        {
          question: "How do I make a QR code menu?",
          answer:
            "Create a menu page in the QRdx dashboard, add sections and items with prices, photos and tags, then download the code for that page and print it on table tents. Edit the menu at any time; the code stays the same.",
        },
        {
          question: "Is a PDF menu behind a QR code a good idea?",
          answer:
            "It works, but PDFs are slow to open on phones, hard to read without zooming, and break if the file link changes. A hosted menu page is faster and editable. If you keep a PDF, host it behind a dynamic code so you can replace it.",
        },
        {
          question: "Does a QR menu need an app?",
          answer:
            "No. Phone cameras open the menu in the browser. Guests don't install anything and don't need an account.",
        },
      ],
      related: ["restaurants", "bars", "coffee-shops", "hotels"],
    },
    {
      slug: "table-tents",
      name: "Table tents",
      noun: "table tents",
      title: "QR codes on table tents",
      seoTitle: "QR Code Table Tents: Size, Design and Placement",
      metaDescription:
        "QR code table tents for restaurants, cafés, hotels and events: what to link to, sizes that scan from a seat, materials and how to measure each table.",
      summary:
        "Seated-distance sizing, two-sided tents and per-table tracking.",
      intro: [
        "A table tent is the most scanned surface in hospitality because it sits at eye level for a seated guest with nothing else to do while waiting. It can carry the menu, Wi-Fi, ordering, a review request or tonight's event, and it is cheap to print in bulk.",
        "Two-sided tents mean two codes with two jobs. Keep each side to one clear action, with a short line of copy above the code.",
      ],
      useCases: [
        {
          title: "Menu and ordering",
          description:
            "The menu on one side, the order-and-pay link on the other.",
        },
        {
          title: "Wi-Fi",
          description: "A Wi-Fi code for cafés, hotels and co-working spaces.",
        },
        {
          title: "Reviews and feedback",
          description:
            "A review or feedback code for guests waiting for the bill.",
        },
        {
          title: "Events and promotions",
          description:
            "This week's event or happy-hour offer, changed weekly behind the same code.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "menu",
          why: "An editable menu so the tent never needs reprinting when the menu changes.",
        },
        {
          kind: "static",
          type: "wifi",
          why: "Joins the network directly; free and never expires.",
        },
        {
          kind: "static",
          type: "google-review",
          why: "Opens the review box. Show it to every guest, not just happy ones.",
        },
        {
          kind: "page",
          page: "event",
          why: "Weekly events and offers you swap without new tents.",
        },
      ],
      distances: [
        { label: "Seated guest", meters: 0.5 },
        { label: "From the next table", meters: 1 },
      ],
      tips: [
        "For a seated guest about 50 cm away, a code around 6 cm wide is comfortable with a short link.",
        "A6 or DL tents leave room for a code and two lines of copy per side; don't crowd them with logos.",
        "Acrylic stands look smart but reflect; test under your lights, or print on matte card inserts.",
        "Number tents per table if you use per-table ordering links.",
      ],
      ctas: [
        "Menu and specials: scan here",
        "Free Wi-Fi: scan to connect",
        "Order and pay from your table",
        "This Friday: live music",
      ],
      faqs: [
        {
          question: "What size QR code for a table tent?",
          answer:
            "About 5 to 6 cm wide for a seated guest with a short link. Larger if the tent is read from the next table or the code holds more data.",
        },
        {
          question: "Should each table have its own QR code?",
          answer:
            "Only if the destination needs the table number, such as some ordering systems, or if you want to compare tables. Otherwise one code per area is enough.",
        },
        {
          question: "What material is best for QR code table tents?",
          answer:
            "Matte coated card for short runs, or a matte acrylic holder with paper inserts you can swap. Both avoid glare and wipe clean.",
        },
      ],
      related: ["restaurants", "coffee-shops", "hotels", "weddings"],
      image: "cafeTableTent",
    },
    {
      slug: "receipts",
      name: "Receipts",
      noun: "receipts",
      title: "QR codes on receipts",
      seoTitle: "QR Codes on Receipts: Reviews, Returns, Loyalty",
      metaDescription:
        "QR codes on receipts: review requests, returns, loyalty sign-ups and surveys, printed on thermal paper at a size that scans, with copy that works.",
      summary: "Reviews, returns, loyalty and surveys from the receipt.",
      intro: [
        "A receipt is in the customer's hand at the end of every sale, which makes it the cheapest place to ask for something: a review, a survey, a loyalty sign-up, or a reason to come back. Most POS systems can print a QR code in the footer.",
        "Receipts are printed on thermal paper at low resolution, so the code must be simple. A short dynamic link keeps the code small and lets you change what it asks for each month.",
      ],
      useCases: [
        {
          title: "Reviews",
          description:
            "A review code at the bottom of the receipt, asked of every customer.",
        },
        {
          title: "Returns and exchanges",
          description: "A code that opens the returns policy or portal.",
        },
        {
          title: "Loyalty and newsletter",
          description:
            "A sign-up link with a reason, such as a discount on the next visit.",
        },
        {
          title: "Surveys",
          description:
            "A two-question survey about the visit, with responses in your dashboard.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic short link in the receipt footer",
          why: "Change what the receipt asks for (reviews this month, survey next month) without touching the POS template.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "A short survey with star ratings and a comment, and the public review link shown to everyone.",
        },
        {
          kind: "static",
          type: "google-review",
          why: "Straight to the Google review box for your business.",
        },
      ],
      distances: [{ label: "Receipt in the hand", meters: 0.3 }],
      tips: [
        "Thermal printers print at about 200 dpi. Keep the code at least 3.5 cm wide so each module spans several printer dots.",
        "Use a short link, not a long URL with tracking parameters, so the code stays simple.",
        "Thermal paper fades; codes are for immediate action, so give people a reason to scan now.",
        "Print a short line of copy above the code, since a bare code at the bottom of a receipt is easy to ignore.",
      ],
      ctas: [
        "How did we do? Scan to review",
        "Scan for 10% off your next visit",
        "Returns made easy: scan here",
        "Two questions, 20 seconds",
      ],
      faqs: [
        {
          question: "Can my POS print a QR code on receipts?",
          answer:
            "Most modern POS systems can print a QR code from a URL in the receipt footer. Paste a QRdx short link so you can change the destination later without editing the POS template.",
        },
        {
          question: "Why won't the QR code on my receipt scan?",
          answer:
            "Usually it's too small or too dense for the thermal printer. Use a short link and print at least 3.5 cm wide; long URLs make tiny modules the printer can't render.",
        },
        {
          question: "Is it okay to offer a discount for a review?",
          answer:
            "Not for Google reviews: Google prohibits incentivised reviews. Offer discounts for loyalty sign-ups or surveys instead, and ask for reviews without an incentive.",
        },
      ],
      related: ["restaurants", "retail", "salons", "bars"],
    },
    {
      slug: "shelves",
      name: "Shelves and shelf talkers",
      noun: "store shelves",
      title: "QR codes on store shelves and shelf talkers",
      seoTitle: "QR Codes on Shelf Talkers and Shelf Tags",
      metaDescription:
        "QR codes on shelf talkers and shelf-edge labels: product details, reviews, recipes and offers in the aisle, with sizes that scan and per-shelf tracking.",
      summary: "Product details, reviews and recipes from the shelf edge.",
      intro: [
        "Shelf talkers and shelf-edge labels catch shoppers at the exact moment of choice. A QR code there can answer the question that makes or breaks the sale: is this vegan, how does it compare, what do I cook with it?",
        "Shelf strips are small and seen at an angle, often under bright, flat lighting. Codes need to be compact but generous with contrast.",
      ],
      useCases: [
        {
          title: "Product comparison",
          description:
            "A talker that opens a comparison of the range on that shelf.",
        },
        {
          title: "Reviews in the aisle",
          description:
            "Ratings and reviews from your website or marketplace listing.",
        },
        {
          title: "Recipes and pairings",
          description:
            "Grocery and wine shelves that open recipes or pairing suggestions.",
        },
        {
          title: "In-store offers",
          description: "A coupon page for a multi-buy or a sample offer.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic code per shelf or bay",
          why: "Measure which shelves get scanned and repoint them when the planogram changes.",
        },
        {
          kind: "page",
          page: "coupon",
          why: "Offers with a scannable barcode for the till, and validity dates.",
        },
        {
          kind: "page",
          page: "video",
          why: "Short demos for products that need explaining.",
        },
      ],
      distances: [
        { label: "Shelf edge, at arm's length", meters: 0.5 },
        { label: "Shelf talker from the aisle", meters: 1.2 },
      ],
      tips: [
        "Place codes at eye or chest height; bottom-shelf codes rarely get scanned.",
        "Keep the code on a white panel, separate from the price and the barcode.",
        "Shelf-edge strips are narrow; a talker that sticks out from the shelf gives more room and catches the eye.",
        "Check retailer guidelines: many stores control what can be placed on their shelves.",
      ],
      ctas: [
        "Not sure which one? Compare here",
        "See reviews",
        "What to cook with this",
        "Scan for today's offer",
      ],
      faqs: [
        {
          question: "How big should a QR code be on a shelf talker?",
          answer:
            "About 6 cm at arm's length with a short link, more if shoppers read it from the aisle. Leave white space around it.",
        },
        {
          question: "Can I track which shelves get scanned?",
          answer:
            "Yes, with one dynamic code per shelf or bay. Scans are counted per code with time and device, so you can compare locations and stores.",
        },
        {
          question: "Do retailers allow brand QR codes on shelves?",
          answer:
            "It depends on the retailer. Many control shelf materials through their own programmes; agree it with the category manager first.",
        },
      ],
      related: ["retail", "wineries", "cosmetics", "pharma"],
      image: "retailShelf",
    },
    {
      slug: "window-decals",
      name: "Window decals",
      noun: "window decals",
      title: "QR codes on window decals",
      seoTitle: "QR Code Window Decals for Shops and Offices",
      metaDescription:
        "QR code window decals: sizes that scan from the pavement, inside vs outside mounting, glare and contrast tips, and what to link to after closing time.",
      summary: "Pavement-distance sizing, glare control and after-hours links.",
      intro: [
        "Shop windows work around the clock. A QR code decal lets passers-by act when you're closed: browse the shop, book a table, see the menu or the listing in the window.",
        "Windows also bring the hardest scanning conditions: reflections, sunlight from behind the viewer, and glass between the camera and the code. Size, mounting and contrast decide whether the decal works.",
      ],
      useCases: [
        {
          title: "Shop after hours",
          description: "Opens the online shop or the product in the display.",
        },
        {
          title: "Opening hours and contact",
          description:
            "A business page with hours, phone and directions for visitors who arrive at a closed door.",
        },
        {
          title: "Bookings",
          description:
            "Restaurants, salons and clinics can take bookings from the window.",
        },
        {
          title: "Listings in the window",
          description:
            "Estate agents and car dealers can link each card in the window to its listing.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "business",
          why: "Hours, address, contact buttons and amenities, updated for holidays.",
        },
        {
          kind: "dynamic",
          label: "Dynamic link for the current window display",
          why: "Repoint the decal when you change the display, without a new decal.",
        },
        {
          kind: "page",
          page: "links",
          why: "Booking, menu and socials on one page behind one decal.",
        },
      ],
      distances: [
        { label: "Door decal, up close", meters: 0.6 },
        { label: "Window, from the pavement", meters: 2 },
      ],
      tips: [
        "Mount on the inside of the glass with an opaque white backing, so the code doesn't show the shop behind it.",
        "From the pavement, about 2 m, the code needs to be around 23 cm wide.",
        "South-facing windows get glare; matte vinyl and a position out of direct sun help.",
        "Put the decal at 1.2 to 1.5 m off the ground and add a line saying what scanning gets you.",
      ],
      ctas: [
        "We're closed, but our shop isn't",
        "Scan for opening hours",
        "Book a table from here",
        "Scan for this property's details",
      ],
      faqs: [
        {
          question: "Should a window QR code go inside or outside the glass?",
          answer:
            "Inside, facing out, with a white opaque backing. It's protected from weather and vandalism, and the backing stops the shop interior showing through.",
        },
        {
          question: "How big should a window QR code be?",
          answer:
            "About 23 cm for people on the pavement 2 m away; about 7 cm on a door where people stand close. Test in daylight and at night.",
        },
        {
          question: "Do QR codes scan through glass?",
          answer:
            "Yes, if the glass is clean and the code has strong contrast. Tinted or reflective glass reduces contrast; make the code larger and test from outside.",
        },
      ],
      related: ["retail", "real-estate", "salons", "restaurants"],
    },
  ],
};
