import type { SeoGroup } from "../types";

export const retailConsumer: SeoGroup = {
  id: "retail-consumer",
  title: "Retail and consumer brands",
  description:
    "Shelf tags, product details, bookings, memberships and service history.",
  items: [
    {
      slug: "retail",
      name: "Retail stores",
      noun: "retail stores",
      title: "QR codes for retail stores",
      seoTitle: "QR Codes for Retail Stores and Shelf Tags",
      metaDescription:
        "How retail stores use QR codes on shelf tags, windows and receipts: product details, reviews, stock alerts and loyalty, with sizes and copy that work.",
      summary:
        "Shelf-tag product details, after-hours window shopping and loyalty.",
      intro: [
        "In a shop, a QR code answers the questions a shelf tag has no room for: what is it made of, does it come in blue, what do other buyers think, and is there one in the back? It also keeps working after closing time, when a code in the window can take an order from someone looking in.",
        "Retail codes are printed in large numbers and stay up for months, so mistakes are expensive. Dynamic codes let you fix a wrong link or move a campaign without reprinting a single tag, and per-code scan counts show which displays people actually use.",
      ],
      useCases: [
        {
          title: "Product details on the shelf tag",
          description:
            "Link each tag to the product page with sizes, materials, care instructions and reviews, so a shopper can decide without finding a staff member.",
        },
        {
          title: "Window shopping after closing",
          description:
            "A large code in the window that opens the online shop or this week's featured product turns evening foot traffic into orders.",
        },
        {
          title: "Loyalty sign-up at the till",
          description:
            "A code on the counter or receipt that opens your loyalty or newsletter sign-up is faster than staff typing email addresses.",
        },
        {
          title: "Marketplace listings",
          description:
            "Shops that also sell on Amazon, Flipkart or Etsy can link displays to the listing where reviews and stock already live.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic link per product or display",
          why: "Point each tag at its product page, then change it when the product page moves or the item is replaced. Scan counts per code show which displays work.",
        },
        {
          kind: "page",
          page: "coupon",
          why: "In-store offers with a code or barcode the till can scan, validity dates and terms, without printing new coupons.",
        },
        {
          kind: "static",
          type: "amazon",
          why: "Opens the product or store page on Amazon, where your ratings and delivery options already are.",
        },
        {
          kind: "static",
          type: "etsy",
          why: "For makers selling at markets and pop-ups: the stall sign opens the Etsy shop for anything sold out on the day.",
        },
      ],
      distances: [
        { label: "Shelf tag, at arm's length", meters: 0.5 },
        { label: "End-of-aisle display", meters: 1.5 },
        { label: "Shop window, from the pavement", meters: 2.5 },
      ],
      tips: [
        "Put shelf-tag codes on the tag face, not on the strip below the shelf edge where shoppers have to crouch.",
        "Shelf tags are small. Keep the code at least 2.5 cm wide and give it the full height of the tag rather than squeezing it beside the price.",
        "Window codes face reflections and sunlight. Print on the inside of the glass with an opaque white backing, and test from the pavement at midday.",
        "Use one dynamic code per display, not one for the whole store, so you can compare which displays get scanned.",
      ],
      ctas: [
        "Scan for sizes, colours and reviews",
        "Shop this window, even when we're closed",
        "Join our rewards club in 10 seconds",
        "Scan to check stock in other sizes",
      ],
      faqs: [
        {
          question: "How do I track which shelf tags get scanned?",
          answer:
            "Give each tag or display its own dynamic code. QRdx counts scans per code with time, country, city and device, so you can compare displays, see when people scan, and export the data as CSV.",
        },
        {
          question:
            "What if a product's web page changes after the tags are printed?",
          answer:
            "With a dynamic code, change the destination in the dashboard and every printed tag follows. With a static code, the tag points at the old address until you reprint it.",
        },
        {
          question: "Can I put one QR code on the whole store?",
          answer:
            "You can, but you lose the detail that makes codes useful in retail. One code per product line or display costs nothing extra to print and tells you what shoppers were looking at when they scanned.",
        },
      ],
      related: ["shelves", "window-decals", "receipts", "packaging"],
      image: "retailShelf",
    },
    {
      slug: "cosmetics",
      name: "Cosmetics brands",
      noun: "cosmetics brands",
      title: "QR codes for cosmetics and beauty brands",
      seoTitle: "QR Codes for Cosmetics and Beauty Packaging",
      metaDescription:
        "QR codes on cosmetics packaging: full ingredient lists, how-to videos, shade finders, authenticity and refills. Tiny-package sizing tips and example copy.",
      summary:
        "Ingredient lists, tutorials, shade finders and refill programmes.",
      intro: [
        "A lipstick tube has about a square centimetre of free space, and the legal text takes most of it. A QR code on the outer box or the tube lets a beauty brand add everything else: the full ingredient list with explanations, a tutorial, the shade range and the refill programme.",
        "Beauty buyers research before they commit, often in the store aisle. A code that opens a short video or a shade guide can close that sale on the spot, and per-code scans show which products shoppers want to know more about.",
      ],
      useCases: [
        {
          title: "Ingredients, explained",
          description:
            "The INCI list on the pack is mandatory and unreadable. Link to a page that explains each ingredient, its purpose and any allergens.",
        },
        {
          title: "How to apply it",
          description:
            "A 30-second tutorial on the box answers 'how do I use this?' better than any leaflet, and it can be reshot for new shades.",
        },
        {
          title: "Shade and skin-type finder",
          description:
            "Testers in stores are a hygiene problem. A code on the display can open a shade guide with swatches on different skin tones.",
        },
        {
          title: "Refills and recycling",
          description:
            "Link the empty container to your refill shop or take-back programme, the moment the customer is holding the empty.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "video",
          why: "Embed the tutorial from YouTube or Vimeo on a fast mobile page; change the video for new launches without new packaging.",
        },
        {
          kind: "page",
          page: "images",
          why: "Swatches on a range of skin tones as a gallery, which shows a shade more honestly than the photo on the box.",
        },
        {
          kind: "dynamic",
          label: "Dynamic link per SKU",
          why: "One code per product points at its ingredient and safety page. Update the page when a formula changes and old stock still points at accurate information.",
        },
      ],
      distances: [
        { label: "Product in the hand", meters: 0.2 },
        { label: "Store display or tester unit", meters: 0.8 },
      ],
      tips: [
        "On small packs, put the code on the outer carton or a flat side, not on a curved tube or cap.",
        "Metallic and holographic packaging confuses cameras. Print the code on a white or matte panel.",
        "Leave a quiet zone even on crowded packaging: four modules of blank space on every side, which matters more than an extra millimetre of code.",
        "Export the code as vector (SVG or CMYK PDF) for the packaging printer; raster images get blurry at 2 cm.",
      ],
      ctas: [
        "Scan for the full ingredient guide",
        "Watch how to apply it in 30 seconds",
        "Find your shade",
        "Empty? Scan to refill or recycle",
      ],
      faqs: [
        {
          question: "Can a QR code replace the ingredient list on cosmetics?",
          answer:
            "Not in most markets. Regulations such as the EU Cosmetics Regulation require the ingredient list on the packaging itself. A QR code is a good place for the explanation and extra detail, not a substitute for mandatory labelling.",
        },
        {
          question: "How small can a QR code on cosmetics packaging be?",
          answer:
            "With a short link, about 2.3 cm works for a product held 20 cm from the phone, as long as each module stays above about 0.4 mm and there is a blank margin around it. Test with several phones on the printed proof.",
        },
        {
          question: "Can I see which products people scan most?",
          answer:
            "Yes, if each product has its own dynamic code. QRdx shows scans over time per code, plus countries, cities and devices, which tells you which products shoppers want to learn more about.",
        },
      ],
      related: ["packaging", "labels", "shelves", "magazines"],
    },
    {
      slug: "salons",
      name: "Salons and spas",
      noun: "salons and spas",
      title: "QR codes for salons, barbers and spas",
      seoTitle: "QR Codes for Salons, Barbers and Spas",
      metaDescription:
        "QR codes for salons and spas: rebook from the mirror, price lists, before-and-after galleries, reviews and tips. Placement ideas and CTA copy that converts.",
      summary: "Rebooking from the chair, price lists, portfolios and reviews.",
      intro: [
        "The best moment to rebook a salon client is while they are still in the chair, looking at the result in the mirror. A code on the mirror or the station card that opens your booking page makes that a ten-second task instead of a phone call next month.",
        "Salons also live on their portfolio and their reviews. Codes at reception can send happy clients to your Google review box and curious ones to a gallery of recent work.",
      ],
      useCases: [
        {
          title: "Rebook before they leave",
          description:
            "A sticker on the mirror or the station that opens your booking page, ideally straight to that stylist's calendar.",
        },
        {
          title: "Prices and services",
          description:
            "A price list behind a dynamic code is easier to keep current than a printed board, and you can add seasonal treatments.",
        },
        {
          title: "Portfolio of recent work",
          description:
            "A gallery of cuts, colours and nails at reception sells add-ons better than describing them.",
        },
        {
          title: "Reviews and tips",
          description:
            "A review code at the till and a tip link for stylists, where your payment provider supports it.",
        },
      ],
      recommended: [
        {
          kind: "static",
          type: "calcom",
          why: "If you book through Cal.com, each stylist can have a code that opens their own booking page.",
        },
        {
          kind: "page",
          page: "images",
          why: "Before-and-after photos in a gallery you refresh every week, behind one printed code at reception.",
        },
        {
          kind: "static",
          type: "google-review",
          why: "Opens the review box directly. Ask every client the same way, whatever their visit was like.",
        },
        {
          kind: "page",
          page: "business",
          why: "Hours, address, services and contact buttons for a window or business-card code.",
        },
      ],
      distances: [
        { label: "Mirror or station card, seated", meters: 0.6 },
        { label: "Reception desk", meters: 1 },
        { label: "Window, from the street", meters: 2 },
      ],
      tips: [
        "On mirrors, place the sticker in the lower corner the client can reach without leaning, and keep it out of the stylist's working area.",
        "Mirror stickers are behind or on glass; use an opaque white backing so the reflection doesn't show through the light modules.",
        "Steam and hair products leave a film. Choose a wipeable laminate and clean the code with the mirror.",
        "Name the stylist next to the booking code if each station has its own.",
      ],
      ctas: [
        "Book your next visit before you go",
        "See our latest colour work",
        "Loved it? Leave a review",
        "Prices and treatments",
      ],
      faqs: [
        {
          question: "What's the best place for a booking QR code in a salon?",
          answer:
            "At the station, where clients see it while the stylist finishes. A second code at reception catches people waiting to pay. Both can point to the same booking page, but separate dynamic codes show which spot works better.",
        },
        {
          question: "Can each stylist have their own QR code?",
          answer:
            "Yes. Create a code per stylist that opens their booking page or a vCard Plus page with their portfolio. If a stylist leaves, repoint their codes to the salon's main page instead of throwing away printed cards.",
        },
        {
          question: "Will a QR code sticker on a mirror scan?",
          answer:
            "Yes, if it has an opaque backing. A clear sticker lets the mirror reflect through the light modules and confuses the camera.",
        },
      ],
      related: ["business-cards", "window-decals", "stickers", "receipts"],
    },
    {
      slug: "gyms",
      name: "Gyms and fitness studios",
      noun: "gyms and fitness studios",
      title: "QR codes for gyms and fitness studios",
      seoTitle: "QR Codes for Gyms and Fitness Studios",
      metaDescription:
        "QR codes for gyms: exercise videos on every machine, class timetables, check-in, membership sign-ups and feedback. Sizing for equipment and wall signs.",
      summary:
        "Machine tutorials, class timetables, check-in and trial sign-ups.",
      intro: [
        "Every gym has members who walk past a machine because they don't know how to use it. A code on the machine that opens a 40-second demonstration video fixes that without a trainer, and helps prevent injuries from bad form.",
        "Timetables change every term and class instructors swap shifts, so the timetable code belongs behind a dynamic link too. Studios that run trials can put a sign-up code on flyers and the front window.",
      ],
      useCases: [
        {
          title: "How to use this machine",
          description:
            "A video per machine, linked from a sticker at eye level when seated or standing at the station.",
        },
        {
          title: "Today's classes",
          description:
            "A code in the changing rooms and at reception that opens the current timetable with booking links.",
        },
        {
          title: "Free trial and membership",
          description:
            "Flyers and window decals that open a trial-pass form, with separate codes per campaign to see which one works.",
        },
        {
          title: "Report a broken machine",
          description:
            "A short form behind each machine's code lets members flag a problem, and because every machine has its own code, you know which one it is.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "video",
          why: "One page per machine with the demonstration video and safety notes. Swap the video when equipment changes.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Fault reports and class feedback, with a separate form per machine or class so you know exactly what is wrong.",
        },
        {
          kind: "dynamic",
          label: "Dynamic link to your class timetable",
          why: "Points at whatever booking system you use this year, so posters survive a software change.",
        },
      ],
      distances: [
        { label: "On the machine", meters: 0.6 },
        { label: "Changing-room poster", meters: 1.2 },
        { label: "Front window", meters: 2.5 },
      ],
      tips: [
        "Put machine stickers where the member's eyes are while using it, not on the base or behind the seat.",
        "Sweat and cleaning spray wear stickers out. Use a wipe-clean laminate and check them during monthly maintenance.",
        "Phones come out between sets, so codes at the water fountain and stretching area get scanned more than ones by the door.",
        "Gym lighting is bright but harsh; matte finishes avoid hot spots on the code.",
      ],
      ctas: [
        "New to this machine? Watch the 40-second demo",
        "Scan for today's classes",
        "Try us free for a week",
        "Something broken? Tell us in 20 seconds",
      ],
      faqs: [
        {
          question: "Should every gym machine have its own QR code?",
          answer:
            "Yes. A separate code per machine opens the right video and lets fault reports name the machine automatically. Scan counts per code also show which equipment members are unsure about.",
        },
        {
          question: "Can I change the video behind a QR code later?",
          answer:
            "With a dynamic code or a hosted video page, yes. Replace the video or link and the sticker on the machine keeps working.",
        },
        {
          question: "Can members check in with a QR code?",
          answer:
            "Check-in usually runs through your membership software, which generates its own member codes. QRdx is better suited to the codes around the gym: videos, timetables, forms and sign-ups.",
        },
      ],
      related: ["stickers", "posters", "flyers", "signs"],
    },
    {
      slug: "automotive",
      name: "Car dealers and garages",
      noun: "car dealers and garages",
      title: "QR codes for car dealerships and garages",
      seoTitle: "QR Codes for Car Dealers and Auto Repair",
      metaDescription:
        "QR codes for car dealerships and garages: window-sticker specs and walkaround videos, test-drive booking, service reminders and reviews, with sizing tips.",
      summary:
        "Window-sticker specs, walkaround videos, test drives and service history.",
      intro: [
        "Car lots are full of people browsing after hours, reading window stickers through the glass. A QR code on each vehicle's window card can open the full spec sheet, a walkaround video and a test-drive booking form, any time of day.",
        "Garages and service centres use codes differently: on the key tag, the invoice and the service sticker on the windscreen, to bring the customer back for the next service and leave a review for this one.",
      ],
      useCases: [
        {
          title: "Every car's full details",
          description:
            "Link each window card to the vehicle listing with history, options and finance examples. When the car sells, repoint the code to similar stock.",
        },
        {
          title: "Book a test drive",
          description:
            "A test-drive request form. Use one per model or vehicle so the sales team knows which car the lead is about.",
        },
        {
          title: "Service reminders",
          description:
            "A windscreen sticker or key tag that opens your booking page when the next service is due.",
        },
        {
          title: "Showroom and workshop reviews",
          description:
            "A review code on the invoice or handover pack catches the customer on delivery day.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic link per vehicle",
          why: "Each window card opens that car's listing; after the sale, change the destination to related stock and reuse the card.",
        },
        {
          kind: "page",
          page: "video",
          why: "A walkaround video of the actual car, which sells used cars better than stock photos.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Test-drive and service enquiry forms that arrive in your dashboard, with responses exportable as CSV.",
        },
        {
          kind: "static",
          type: "google-review",
          why: "On the invoice and key tag, sending customers straight to the review box.",
        },
      ],
      distances: [
        { label: "Key tag or invoice", meters: 0.3 },
        { label: "Window card, through the glass", meters: 0.8 },
        { label: "Forecourt sign", meters: 4 },
      ],
      tips: [
        "Window cards are read through tinted glass at an angle. Print the code larger than you think, and test through the actual window.",
        "Sun-facing cards fade in weeks; use UV-resistant inks or swap the cards, since dynamic codes make the card itself reusable.",
        "Put the vehicle's stock number as text next to the code for staff and for people who don't scan.",
        "On forecourt signs, keep the code at eye height for people walking the lot rather than on the top banner.",
      ],
      ctas: [
        "Scan for full specs and a walkaround video",
        "Book a test drive of this car",
        "Service due? Book in one minute",
        "How did we do? Leave a review",
      ],
      faqs: [
        {
          question: "What happens to a car's QR code after it's sold?",
          answer:
            "With a dynamic code, change its destination to similar stock or your inventory page and keep using the card on another vehicle. Static codes would keep pointing at a sold listing.",
        },
        {
          question: "Will a QR code scan through a car window?",
          answer:
            "Usually, but tint and reflections reduce contrast. Use a larger code with strong contrast, place the card flat against the glass, and test from outside in daylight.",
        },
        {
          question: "Can I see which cars get the most interest?",
          answer:
            "Yes. With one dynamic code per vehicle, QRdx shows scans per code over time, including after-hours scans by people walking the lot.",
        },
      ],
      related: ["vehicles", "signs", "invoices", "window-decals"],
    },
  ],
};
