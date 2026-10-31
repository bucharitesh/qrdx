import type { SeoGroup } from "../types";

export const printMarketing: SeoGroup = {
  id: "print-marketing",
  title: "Print marketing",
  description:
    "Cards, flyers, posters, brochures, catalogues, mailers and magazine ads.",
  items: [
    {
      slug: "business-cards",
      name: "Business cards",
      noun: "business cards",
      title: "QR codes on business cards",
      seoTitle: "QR Codes on Business Cards: Size, Design and Content",
      metaDescription:
        "How to put a QR code on a business card: vCard or digital card, the right size (about 2.3 cm), placement on front or back, and wording that gets scanned.",
      summary:
        "Save-to-phone contacts, digital cards and the right size for a 85 mm card.",
      intro: [
        "A QR code on a business card should do one thing: put your details into the other person's phone so they don't type them, or lose the card. There are two ways to do it. A static vCard code holds the contact itself, works offline and never changes. A dynamic vCard Plus code opens a contact page you can update when you change jobs, phone numbers or photos.",
        "Space is the constraint. A standard card is about 85 × 55 mm, and the code competes with your name, logo and title. The size table below shows how small you can go for a card held in the hand.",
      ],
      useCases: [
        {
          title: "Save the contact in one scan",
          description:
            "Name, title, company, phone, email and website saved straight to the phone's contacts, with no typing and no spelling mistakes.",
        },
        {
          title: "A digital card you can update",
          description:
            "Changed roles or numbers? Update the vCard Plus page and every card you've already handed out shows the new details.",
        },
        {
          title: "Your portfolio or booking page",
          description:
            "Designers, photographers and consultants can link straight to work samples or a booking calendar instead.",
        },
        {
          title: "LinkedIn connection",
          description:
            "A LinkedIn profile code connects at events faster than searching for a common name.",
        },
      ],
      recommended: [
        {
          kind: "static",
          type: "vcard",
          why: "The contact lives inside the code: free, offline and permanent. The trade-off is a denser code, so print it slightly larger, and reprint if your details change.",
        },
        {
          kind: "page",
          page: "vcard",
          why: "A short link to a contact page with photo, buttons and a Save contact button. Smaller, simpler code, and you can edit it after printing.",
        },
        {
          kind: "static",
          type: "linkedin",
          why: "For networking-heavy roles: opens your LinkedIn profile or company page.",
        },
        {
          kind: "static",
          type: "calcom",
          why: "For consultants: opens your Cal.com booking page so a conversation turns into a meeting.",
        },
      ],
      distances: [
        { label: "Card held in the hand", meters: 0.2 },
        { label: "Card on the table", meters: 0.4 },
      ],
      tips: [
        "With a short link, about 2.3 cm square is the practical minimum. A static vCard with a full address holds several times more data, so the same card needs a code of 4 to 5 cm; check yours in the print size calculator.",
        "Put the code on the back with a line of text, and keep the front for your name and brand. Cards are turned over when people look for details.",
        "Avoid spot UV, foil or embossing over the code, and leave a clear margin to the card edge.",
        "Send the printer an SVG or CMYK PDF rather than a PNG so the modules stay crisp.",
      ],
      ctas: [
        "Scan to save my contact",
        "Scan for my portfolio",
        "Book a call with me",
        "Connect on LinkedIn",
      ],
      faqs: [
        {
          question: "Should I use a vCard QR code or a digital business card?",
          answer:
            "A static vCard is best when your details rarely change and you want it to work offline forever, and you have room for a larger code. A dynamic vCard Plus page is better when you change roles, want a photo and social links, or want to know how many people scanned.",
        },
        {
          question: "What size should a QR code be on a business card?",
          answer:
            "At least about 2.3 cm for a short link scanned from 20 cm. A static vCard with a full address makes a much denser code that needs 4 cm or more for the same distance, which is why short-link contact pages suit cards so well. Test the printed proof with two or three different phones.",
        },
        {
          question: "Front or back of the card?",
          answer:
            "Usually the back, where there is room for the code and a short call to action. A minimalist card can put a small code on the front if it is the only element besides your name.",
        },
      ],
      related: ["real-estate", "law-firms", "salons", "events"],
      image: "businessCard",
    },
    {
      slug: "flyers",
      name: "Flyers",
      noun: "flyers",
      title: "QR codes on flyers",
      seoTitle: "QR Codes on Flyers: Placement, Size and Tracking",
      metaDescription:
        "How to put QR codes on flyers and leaflets: what to link to, where to place the code, how big to print, and how to track which distribution worked.",
      summary:
        "Link a leaflet to an offer, sign-up or event and measure each drop.",
      intro: [
        "Flyers are cheap to print and hard to measure. A QR code fixes the second part: if every distribution (door drop, event handout, café counter) carries its own dynamic code, the scan counts tell you which one worked, at no extra cost per flyer.",
        "The code also lets a flyer stay simple. Put the headline and the offer on paper, and the details (map, menu, booking form) behind the code.",
      ],
      useCases: [
        {
          title: "Event promotion",
          description:
            "A flyer that opens the event page with tickets, venue map and add-to-calendar.",
        },
        {
          title: "Door-to-door offers",
          description:
            "A coupon page for a new shop or takeaway, with one code per neighbourhood to see where customers come from.",
        },
        {
          title: "Sign-ups and enquiries",
          description:
            "Classes, clubs and services that need a name and phone number: open a short form instead of asking people to call.",
        },
        {
          title: "Menus for delivery",
          description:
            "Takeaway leaflets that open the current menu and ordering page, so old leaflets don't quote old prices.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic code per distribution",
          why: "One code per area or channel, all to the same page. Compare scans and stop paying for the drops that don't work.",
        },
        {
          kind: "page",
          page: "coupon",
          why: "An offer with a code, validity dates and terms; extend or end it without new flyers.",
        },
        {
          kind: "page",
          page: "event",
          why: "Date, time, venue map and calendar buttons for gigs, open days and launches.",
        },
      ],
      distances: [
        { label: "Flyer in the hand", meters: 0.3 },
        { label: "Flyer pinned to a noticeboard", meters: 0.8 },
      ],
      tips: [
        "Place the code near the offer or headline, not in the footer with the small print.",
        "On A5 and DL flyers, 3 to 4 cm is comfortable; bigger codes on noticeboards are read from further away.",
        "Avoid placing the code across a fold or near the trim edge, where it can be cut or creased.",
        "Uncoated recycled paper spreads ink. Use solid black and check a printed proof.",
      ],
      ctas: [
        "Scan for 2-for-1 this week",
        "Scan for the full programme",
        "Book your free trial class",
        "Order online from our menu",
      ],
      faqs: [
        {
          question: "Where should a QR code go on a flyer?",
          answer:
            "Next to the main offer or call to action, usually in the lower half of the front. People scan when they decide they're interested, so put the code where that decision happens.",
        },
        {
          question: "How do I track flyer distributions with QR codes?",
          answer:
            "Create one dynamic code per distribution and print each batch with its own code. QRdx counts scans per code over time, with city and device, so you can compare areas and channels.",
        },
        {
          question: "Can I change the offer after the flyers are printed?",
          answer:
            "With a dynamic code or a hosted coupon page, yes. Edit the page or point the code somewhere else, and every flyer already out there follows.",
        },
      ],
      related: ["events", "restaurants", "nonprofits", "gyms"],
    },
    {
      slug: "posters",
      name: "Posters",
      noun: "posters",
      title: "QR codes on posters",
      seoTitle: "QR Codes on Posters: How Big and Where to Place",
      metaDescription:
        "QR codes on posters: how big to print for the viewing distance, where to place them, what to link to and how to measure which poster sites get scanned.",
      summary: "Sizing for viewing distance and measuring each poster site.",
      intro: [
        "Posters are seen from a distance and scanned by people who stop. The code has to be big enough for the distance people actually stand from it, and placed where they can stand still: at a bus stop, in a queue, on a noticeboard, not on a wall people walk past at speed.",
        "Because posters go up in many places at once, they are ideal for per-site tracking. Give each location its own dynamic code and the scan counts tell you which sites earned their cost.",
      ],
      useCases: [
        {
          title: "Events and tickets",
          description:
            "Gig, theatre and festival posters that open ticket sales and the line-up.",
        },
        {
          title: "Campaigns with a single action",
          description:
            "Sign a petition, download an app, enter a competition: one action per poster, behind one code.",
        },
        {
          title: "Recruitment",
          description:
            "Job posters in shops and offices that open the application page.",
        },
        {
          title: "Public information",
          description:
            "Health campaigns and notices with the details, translations and contact options behind the code.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic code per poster site",
          why: "Measure each site separately and repoint codes when the campaign moves on, so old posters still lead somewhere useful.",
        },
        {
          kind: "page",
          page: "event",
          why: "Event posters that open the time, venue map and calendar buttons, plus your ticket link.",
        },
        {
          kind: "page",
          page: "apps",
          why: "App campaigns: one code that opens the App Store on iPhone and Google Play on Android.",
        },
      ],
      distances: [
        { label: "A4 poster on a noticeboard", meters: 1 },
        { label: "A2 poster in a corridor", meters: 2 },
        { label: "A0 poster at a bus shelter", meters: 3 },
      ],
      tips: [
        "Size the code for the distance people stand from the poster, not for the poster's size. From 2 m, about 23 cm; from 3 m, about 35 cm.",
        "Place the code between waist and head height, around 1.2 to 1.5 m off the ground.",
        "Behind glass (bus shelters, frames), reflections are the main problem. Test at the site, at different times of day.",
        "Give the code a reason: a short line like 'Scan for tickets' beats a bare code.",
      ],
      ctas: [
        "Scan for tickets",
        "Scan to apply in 2 minutes",
        "Get the app",
        "Scan to sign the petition",
      ],
      faqs: [
        {
          question: "How big should a QR code be on a poster?",
          answer:
            "Divide the scanning distance by about 10, then add a little for a short link: from 2 m, about 23 cm; from 3 m, about 35 cm. Longer content needs bigger codes; the print size calculator works it out for your exact link.",
        },
        {
          question: "Where on the poster should the QR code go?",
          answer:
            "Low enough to reach, high enough to see: roughly at chest height on the final mounted poster, with a short call to action next to it.",
        },
        {
          question: "Can I track which poster locations work?",
          answer:
            "Yes. Print each location with its own dynamic code. Scans are counted per code with time and city, so you can compare sites.",
        },
      ],
      related: ["events", "bars", "transportation", "healthcare"],
      image: "busStopPoster",
    },
    {
      slug: "brochures",
      name: "Brochures",
      noun: "brochures",
      title: "QR codes in brochures",
      seoTitle: "QR Codes in Brochures and Prospectuses",
      metaDescription:
        "QR codes in brochures and prospectuses: link pages to videos, prices, booking and detailed specs, keep printed brochures current and measure which pages work.",
      summary:
        "Videos, prices and booking from each page, kept current after print.",
      intro: [
        "Brochures are printed in runs of thousands and kept on desks and in drawers for months. The prices, dates and specs inside them go out of date long before the paper does. QR codes on each spread can point at the current details, so the brochure stays useful.",
        "They also show which pages readers care about. A separate dynamic code on each product or section tells you what people looked up, which is useful for the next edition.",
      ],
      useCases: [
        {
          title: "Current prices and availability",
          description:
            "Print 'from' prices and let the code open the live price list, avoiding reprints when prices change.",
        },
        {
          title: "Video and tours",
          description:
            "A property, venue or product video next to the photo, for readers who want to see more.",
        },
        {
          title: "Booking and enquiries",
          description:
            "A code on the back page that opens the booking or enquiry form.",
        },
        {
          title: "Detailed specifications",
          description:
            "Technical sheets for buyers who need them, without filling the brochure with tables.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic code per section",
          why: "One per product or chapter to see what readers look up, and to keep each pointing at current information.",
        },
        {
          kind: "page",
          page: "pdf",
          why: "Spec sheets and price lists hosted as PDFs you replace without changing the code.",
        },
        {
          kind: "page",
          page: "video",
          why: "Tours and demos from YouTube or Vimeo on a fast mobile page.",
        },
      ],
      distances: [
        { label: "Brochure open on a desk", meters: 0.35 },
        { label: "Brochure rack display", meters: 1 },
      ],
      tips: [
        "Keep codes away from the gutter (the fold in the middle) and the trim edge.",
        "About 4 cm is comfortable on an A4 or A5 page read at desk distance.",
        "Use the same position on each spread so readers learn where to look.",
        "Uncoated stock looks premium but softens edges; proof the code on the chosen paper.",
      ],
      ctas: [
        "Scan for today's prices",
        "Watch the tour",
        "Full specifications",
        "Book your visit",
      ],
      faqs: [
        {
          question: "How do QR codes keep a brochure up to date?",
          answer:
            "Print stable content on paper and link the parts that change (prices, dates, availability) through dynamic codes. When something changes, edit the destination instead of reprinting.",
        },
        {
          question: "Can I see which brochure pages get scanned?",
          answer:
            "Yes, with a separate dynamic code per page or product. QRdx shows scans per code over time, and you can export them as CSV.",
        },
        {
          question:
            "What resolution should the QR code be for brochure printing?",
          answer:
            "Use vector artwork, SVG or a CMYK PDF, which has no resolution limit. If you must use PNG, export at least 300 dpi at the final printed size.",
        },
      ],
      related: ["real-estate", "tourism", "education", "law-firms"],
    },
    {
      slug: "catalogs",
      name: "Catalogues",
      noun: "catalogues",
      title: "QR codes in product catalogues",
      seoTitle: "QR Codes in Product Catalogues",
      metaDescription:
        "QR codes in print catalogues: link each product to its page, stock and reviews, measure which products readers look up, and size codes for catalogue pages.",
      summary:
        "Product-level links from print to the online shop, with per-item scans.",
      intro: [
        "A print catalogue is still one of the best-performing sales tools for many retailers and B2B suppliers, but it has two weaknesses: it can't show stock levels, and ordering means typing a product code into a website. A QR code next to each product, or each spread, fixes both.",
        "Catalogues are big print runs with long lives, so codes should be dynamic. A product page URL that changes next month, or a product that sells out, shouldn't break a catalogue that will sit on desks until next season.",
      ],
      useCases: [
        {
          title: "Buy this product",
          description:
            "A small code by each product that opens its page with stock, sizes and reviews.",
        },
        {
          title: "See it in use",
          description:
            "Videos, 360° views or galleries for products that photograph poorly on paper.",
        },
        {
          title: "Trade and B2B ordering",
          description:
            "Codes that open the reorder page for account customers, with the product already selected by the link.",
        },
        {
          title: "Request a quote",
          description:
            "A form for custom orders or bulk pricing on the last page.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic code per product or spread",
          why: "Repoint discontinued items to their replacements, and see which products readers scan. Create them in bulk through the API.",
        },
        {
          kind: "page",
          page: "images",
          why: "A gallery of extra product shots, colours or finishes.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Quote requests with text, email and choice fields, collected in your dashboard.",
        },
      ],
      distances: [
        { label: "Catalogue held in the hand", meters: 0.25 },
        { label: "Catalogue on a desk", meters: 0.35 },
      ],
      tips: [
        "Per-product codes can be small, about 2.5 to 3 cm, if they sit on white space beside the product photo.",
        "Generate codes in bulk from your product list so each item has its own code and analytics.",
        "Keep codes in the same position relative to each product so readers find them without searching.",
        "Print a product number next to the code for people ordering by phone.",
      ],
      ctas: [
        "Scan to buy",
        "See it in 360°",
        "Reorder in one scan",
        "Request a bulk quote",
      ],
      faqs: [
        {
          question: "Should every product in a catalogue have its own QR code?",
          answer:
            "If space allows, yes. Per-product codes go straight to the right page and tell you which products readers looked up. If space is tight, one code per spread that opens a page listing those products works too.",
        },
        {
          question: "How do I create hundreds of QR codes for a catalogue?",
          answer:
            "Use the bulk generator for static codes from a CSV, or the QRdx REST API to create dynamic codes in bulk on a paid plan. Export each as SVG for the layout.",
        },
        {
          question: "What happens when a product is discontinued?",
          answer:
            "With a dynamic code, point it at the replacement product or the category page. The printed catalogue keeps working.",
        },
      ],
      related: ["retail", "manufacturing", "wineries", "cosmetics"],
    },
    {
      slug: "direct-mail",
      name: "Direct mail",
      noun: "direct mail",
      title: "QR codes on direct mail",
      seoTitle: "QR Codes on Direct Mail and Postcards",
      metaDescription:
        "QR codes on direct mail and postcards: personalised landing pages, offers, response tracking per mailing and print specs that survive the postal system.",
      summary:
        "Response tracking per mailing, offers and sign-ups from postcards.",
      intro: [
        "Direct mail's classic weakness is attribution: you know how many pieces you sent, not how many people acted. A dynamic QR code on each version of the mailing gives you scan counts per version, region or segment, without the reader typing a promo URL.",
        "Mail also sits on kitchen counters for days before someone acts, so the offer behind the code needs to be editable: extend a deadline or fix a typo without a second mailing.",
      ],
      useCases: [
        {
          title: "Offers and promotions",
          description:
            "A postcard with an offer that opens a coupon page with the code and terms.",
        },
        {
          title: "Fundraising appeals",
          description:
            "A code on the appeal letter that opens the donation page for this campaign.",
        },
        {
          title: "Sign-ups and quotes",
          description:
            "Insurance, solar, broadband: a code that opens the quote form, measured per mailing version.",
        },
        {
          title: "A/B testing creative",
          description:
            "Two designs, two codes. Compare scans to see which design drives response.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic code per version or segment",
          why: "Separate codes for each design, region or audience, with UTM parameters added at redirect on Pro so your web analytics see the source.",
        },
        {
          kind: "page",
          page: "coupon",
          why: "The offer, code, expiry date and terms, editable after the mail drops.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "A quote or call-back request form with your own questions.",
        },
      ],
      distances: [
        { label: "Postcard in the hand", meters: 0.3 },
        { label: "Letter on the counter", meters: 0.5 },
      ],
      tips: [
        "Keep the code clear of the address area and postal barcodes, which sorting machines read.",
        "Postcards get scuffed in transit. Use a slightly larger code and error correction Q or H.",
        "Put the code next to the offer and the deadline, with the URL printed as text for people who'd rather type.",
        "Test the code on the printed mail piece, not just the PDF proof.",
      ],
      ctas: [
        "Scan to claim your welcome offer",
        "Get your quote in 2 minutes",
        "Scan to give to this appeal",
        "Book your free survey",
      ],
      faqs: [
        {
          question: "How do I measure direct mail response with QR codes?",
          answer:
            "Give each version of the mailing its own dynamic code, and compare scans in the dashboard. Add UTM parameters to see the same campaigns in your web analytics.",
        },
        {
          question: "Can I personalise QR codes for each recipient?",
          answer:
            "Yes, by generating a unique code per recipient through the API or the bulk generator, typically with an ID in the URL. Mind privacy rules: don't encode personal data in the URL itself.",
        },
        {
          question: "Will the code still work if the offer ends?",
          answer:
            "Yes. Point the code at a 'this offer has ended' page or your current offer. On Pro, set an expiry date with a fallback URL so it switches automatically.",
        },
      ],
      related: ["nonprofits", "banks", "marketing-agencies", "real-estate"],
    },
    {
      slug: "magazines",
      name: "Magazines",
      noun: "magazines",
      title: "QR codes in magazines and print ads",
      seoTitle: "QR Codes in Magazine and Newspaper Ads",
      metaDescription:
        "QR codes in magazine and newspaper ads and editorial: shoppable pages, video, subscriptions and ad response tracking, plus size and placement for print.",
      summary:
        "Shoppable ads, video extras and response tracking per publication.",
      intro: [
        "A print ad in a magazine reaches a reader who is relaxed and paying attention, but asking them to remember a URL is a lost cause. A QR code turns the ad into a direct path to the product, and separate codes per title let you compare publications.",
        "Editorial uses codes too: recipes that open a video, interviews that open the full recording, and subscription offers on the back page.",
      ],
      useCases: [
        {
          title: "Shoppable ads",
          description:
            "The product in the ad, one scan away, with a separate code per magazine to compare titles.",
        },
        {
          title: "Video and audio extras",
          description:
            "A recipe video, a behind-the-scenes clip or the full interview recording.",
        },
        {
          title: "Subscriptions and newsletters",
          description:
            "Subscription offers that open the sign-up page with the offer applied.",
        },
        {
          title: "Competitions",
          description:
            "Reader competitions that open an entry form instead of a postal coupon.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic code per publication and issue",
          why: "Compare response across titles and issues, and change the landing page if stock runs out.",
        },
        {
          kind: "page",
          page: "video",
          why: "Recipe and product videos embedded on a fast page.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Competition entry forms with text, email and choice fields.",
        },
      ],
      distances: [
        { label: "Magazine in the hand", meters: 0.35 },
        { label: "Newspaper on a table", meters: 0.5 },
      ],
      tips: [
        "Avoid the gutter. Codes near the binding curve into the fold and fail.",
        "Newsprint is grey and absorbent. Make the code larger, about 4 to 5 cm, and use solid black.",
        "Glossy magazine paper reflects light; that is fine for most phones, but test under a lamp.",
        "Put a short URL next to the code for readers who don't scan.",
      ],
      ctas: [
        "Scan to shop this look",
        "Watch the recipe",
        "Subscribe for half price",
        "Enter the competition",
      ],
      faqs: [
        {
          question: "Do QR codes work on newsprint?",
          answer:
            "Yes, if they're large enough and printed in solid black. Newsprint spreads ink, so give the code more size and keep the quiet zone clear.",
        },
        {
          question: "How do I compare ad response across magazines?",
          answer:
            "Use a different dynamic code in each publication. Scans are counted per code, and UTM parameters (on Pro) carry the source into your web analytics.",
        },
        {
          question: "Can a print ad link change after publication?",
          answer:
            "With a dynamic code, yes. Change the destination at any time; back issues on coffee tables will open the new page.",
        },
      ],
      related: ["marketing-agencies", "cosmetics", "retail", "wineries"],
    },
  ],
};
