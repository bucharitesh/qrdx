import type { SeoGroup } from "../types";

export const foodDrink: SeoGroup = {
  id: "food-drink",
  title: "Food and drink",
  description:
    "Menus that change daily, guest Wi-Fi, reviews, ordering and bottle labels.",
  items: [
    {
      slug: "restaurants",
      name: "Restaurants",
      noun: "restaurants",
      title: "QR codes for restaurants",
      seoTitle: "QR Codes for Restaurants: Menus, Wi-Fi and Reviews",
      metaDescription:
        "How restaurants use QR codes for menus, guest Wi-Fi, reviews and table ordering: which code type to pick, what size to print and copy that gets scans.",
      summary:
        "Menus you can update, guest Wi-Fi, review requests and table ordering.",
      intro: [
        "A restaurant QR code usually does one of three jobs: open the menu, join the Wi-Fi or ask for a review. Each needs a different kind of code. Menus change with the season and the supplier, so they belong behind a dynamic code you can edit. A Wi-Fi password rarely changes, so a free static code is enough.",
        "Below: where restaurants put QR codes, which QRdx code type fits each job, how big to print them for a table or a front window, and short lines of copy that make guests scan.",
      ],
      useCases: [
        {
          title: "A menu you can edit tonight",
          description:
            "Put a hosted menu page behind every table code. Mark a dish sold out, change a price or add the weekend special from your phone, and the printed table tents stay exactly as they are.",
        },
        {
          title: "Guest Wi-Fi without spelling the password",
          description:
            "A static Wi-Fi code on the counter or the back of the menu joins the network in one scan, so staff stop reading the password out to every table.",
        },
        {
          title: "Reviews while the meal is fresh",
          description:
            "Print a Google review code on the bill folder or receipt. Ask every guest the same way; selectively asking happy guests breaks Google's review rules.",
        },
        {
          title: "Ordering and paying at the table",
          description:
            "Point table codes at your ordering or payment provider. If the provider needs a table number in the URL, make one dynamic code per table.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "menu",
          why: "Edit dishes, prices, allergen tags and sold-out items without reprinting. Use separate codes for the terrace, the bar and takeaway bags to see in analytics where guests scan.",
        },
        {
          kind: "static",
          type: "wifi",
          why: "The network name and password live in the code itself, so it needs no account and never expires. Reprint only when you change the password.",
        },
        {
          kind: "static",
          type: "google-review",
          why: "Opens the 'write a review' box for your Google Business Profile directly, one tap fewer than a link to your listing.",
        },
        {
          kind: "dynamic",
          label: "Dynamic link to your ordering page",
          why: "If you switch ordering or payment providers, change the destination and keep every printed table code.",
        },
      ],
      distances: [
        { label: "Table tent, seated guest", meters: 0.4 },
        { label: "Counter or menu board", meters: 1.5 },
        { label: "Front window, from the pavement", meters: 2 },
      ],
      tips: [
        "Stand table codes up on a tent or holder at a seated guest's eye level. Codes lying flat get covered by plates and catch glare from pendant lights.",
        "Choose a matte finish for laminated menus and table tents; glossy lamination reflects overhead light straight into the camera.",
        "Evening lighting is where pale brand colours fail first. Keep the code dark on a light background and test it at your dimmest service.",
        "Keep a blank margin of four modules around the code, and don't let the table number or logo touch it.",
      ],
      ctas: [
        "Scan for today's menu and specials",
        "Join our Wi-Fi: scan, no password needed",
        "Enjoyed your meal? Scan to leave a review",
        "Scan to order and pay from your table",
      ],
      faqs: [
        {
          question: "Should a restaurant menu QR code be static or dynamic?",
          answer:
            "Dynamic. A static code that encodes a PDF link breaks as soon as the file moves, and every menu change means reprinting. A dynamic code opens a short link you can repoint, or a hosted menu page you edit directly, so the printed code outlives every menu revision.",
        },
        {
          question: "Do I still need printed menus?",
          answer:
            "Keep some. Not every guest carries a charged phone or wants to use it at dinner, and some places expect an accessible alternative. Treat the QR menu as the faster option, not the only one.",
        },
        {
          question: "Can I ask only happy guests for a Google review?",
          answer:
            "No. Google's policies prohibit selectively soliciting positive reviews (review gating). Show the review link to every guest. QRdx feedback forms show the Google review link to everyone, whatever rating they give.",
        },
      ],
      related: ["menus", "table-tents", "receipts", "window-decals"],
      image: "cafeTableTent",
    },
    {
      slug: "coffee-shops",
      name: "Coffee shops",
      noun: "coffee shops",
      title: "QR codes for coffee shops and cafés",
      seoTitle: "QR Codes for Coffee Shops and Cafés",
      metaDescription:
        "QR code ideas for coffee shops: loyalty sign-ups, Wi-Fi, mobile ordering, bean origin stories and reviews, plus print sizes for cups, counters and windows.",
      summary:
        "Wi-Fi for laptop regulars, loyalty sign-ups, order-ahead and bean stories.",
      intro: [
        "Coffee shops have two audiences: the regular in a hurry who wants to order ahead, and the guest who stays for two hours on a laptop and wants the Wi-Fi. A small café can serve both with a couple of well-placed codes rather than a wall of them.",
        "Cups, sleeves and bags also leave the shop, which makes them the cheapest advertising a café has. A code on a sleeve that opens your order-ahead page brings people back from the office down the road.",
      ],
      useCases: [
        {
          title: "Wi-Fi on every table",
          description:
            "A static Wi-Fi code on a small table card saves the barista from answering the same question all day. Change the password monthly? Reprint the cards, or link to a page that shows the current one.",
        },
        {
          title: "Order ahead from the cup sleeve",
          description:
            "Sleeves and takeaway bags travel. A code that opens your ordering app or page turns a passer-by's empty cup into the next order.",
        },
        {
          title: "Loyalty and newsletter sign-ups",
          description:
            "Replace paper stamp cards with a code at the till that opens your loyalty programme's sign-up page or a short feedback form.",
        },
        {
          title: "The story behind the beans",
          description:
            "On retail bags of beans, link to the farm, roast date and brewing guide. A hosted page lets you update it for every new lot.",
        },
      ],
      recommended: [
        {
          kind: "static",
          type: "wifi",
          why: "Joins the network without typing. Works offline and never expires, but needs a reprint whenever the password changes.",
        },
        {
          kind: "page",
          page: "apps",
          why: "If you have an ordering app, one code on the sleeve shows the App Store button on iPhones and Google Play on Android.",
        },
        {
          kind: "page",
          page: "links",
          why: "One page for the menu, Instagram, opening hours and the loyalty sign-up, so the counter needs a single code.",
        },
        {
          kind: "static",
          type: "instagram",
          why: "Latte art and new pastries are what cafés post. A profile code on the pastry case gets you followers who see every post.",
        },
      ],
      distances: [
        { label: "Cup sleeve or table card", meters: 0.3 },
        { label: "Queue at the counter", meters: 1.2 },
        { label: "Window, from the street", meters: 2 },
      ],
      tips: [
        "Cups and sleeves are curved. Keep the code small enough to sit on the flattest part, roughly a third of the sleeve's height, and test it on a filled cup.",
        "Kraft paper is brown and absorbent. Print the code in solid black, without a gradient, and check that the ink doesn't spread and fill the gaps.",
        "Put the ordering code where people queue, not behind the till where the barista stands.",
        "Steam and condensation fog acrylic stands near the machine; place codes away from it.",
      ],
      ctas: [
        "Skip the queue next time: scan to order ahead",
        "Free Wi-Fi: scan to connect",
        "Scan to join our loyalty club and get your 10th coffee free",
        "Meet the farm behind this roast",
      ],
      faqs: [
        {
          question: "What should a coffee shop QR code link to?",
          answer:
            "Start with the question staff hear most. For most cafés that is the Wi-Fi password, then the menu or ordering page. A link list page can hold the menu, socials, hours and loyalty sign-up behind one counter code.",
        },
        {
          question: "Will a QR code on a paper cup still scan?",
          answer:
            "Usually, if it is big enough and printed in a dark solid colour. Curvature distorts the code, so keep it on the flattest area and about 3 to 3.5 cm wide, and test on real cups before ordering a full print run.",
        },
        {
          question: "How do I know if the cup codes bring people back?",
          answer:
            "Use a dynamic code for the sleeves, separate from the one at the counter. QRdx counts scans per code, so you can compare sleeve scans with in-store scans week by week.",
        },
      ],
      related: ["mugs", "table-tents", "stickers", "packaging"],
    },
    {
      slug: "bars",
      name: "Bars and pubs",
      noun: "bars and pubs",
      title: "QR codes for bars and pubs",
      seoTitle: "QR Codes for Bars and Pubs: Drinks Menus and Events",
      metaDescription:
        "QR codes for bars and pubs: drinks menus that track what's on tap, event nights, table ordering, Wi-Fi and reviews. Sizing for dim light and print tips.",
      summary:
        "What's on tap tonight, event nights, table service and dim-light tips.",
      intro: [
        "Bars change what they pour more often than restaurants change what they cook. Guest taps rotate, cocktails go seasonal and happy-hour prices move by the hour. A drinks menu behind a dynamic code keeps up without a new print run every keg.",
        "The other challenge is light. Bars are dark on purpose, and a code that scans fine in the office can fail at the end of the bar at 11 pm. Contrast and size matter more here than almost anywhere else.",
      ],
      useCases: [
        {
          title: "What's on tap tonight",
          description:
            "Keep a hosted menu page with sections for draught, bottles and cocktails. Mark a keg empty from behind the bar and guests stop ordering it.",
        },
        {
          title: "Quiz nights, live music and match days",
          description:
            "A code on posters and beer mats that opens an event page with the date and an add-to-calendar button fills the room on a slow Tuesday.",
        },
        {
          title: "Ordering from the booth",
          description:
            "Table codes linked to your ordering system keep people in their seats during busy rounds. Repoint them if you change provider.",
        },
        {
          title: "Reviews and tips",
          description:
            "A review code on the bill tray, or a payment code for tips where your provider supports links, catches guests at the end of the night.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "menu",
          why: "Sections, prices and sold-out flags suit a rotating tap list. Diet tags cover gluten-free and alcohol-free options.",
        },
        {
          kind: "page",
          page: "event",
          why: "One page per event night with time, details and calendar buttons. Swap it for next week's event on the same printed poster.",
        },
        {
          kind: "static",
          type: "google-review",
          why: "Sends guests straight to the review box. Show it to everyone, not just the regulars you know are happy.",
        },
      ],
      distances: [
        { label: "Beer mat or table card", meters: 0.35 },
        { label: "Along the bar", meters: 1 },
        { label: "Poster by the door", meters: 2 },
      ],
      tips: [
        "Dim, warm lighting cuts contrast. Use pure black on white (or white on very dark) and avoid red or amber codes, which wash out under warm bulbs.",
        "Go one size up from what the calculator says for anything at the far end of the bar.",
        "Beer mats get wet. Use coated board, or put the code on a table card that stays dry.",
        "Place the event poster code at chest height near the door, where people pause, not above the bar.",
      ],
      ctas: [
        "See what's on tap tonight",
        "Quiz every Tuesday: scan to save the date",
        "Order another round without leaving your seat",
        "Had a good night? Leave us a review",
      ],
      faqs: [
        {
          question: "Why won't my bar's QR code scan in the evening?",
          answer:
            "Usually contrast and size. Phone cameras raise their sensitivity in the dark and lose detail, so fine modules and pale colours fail first. Print larger, in black on white, and test at your darkest table during service.",
        },
        {
          question: "Can one code show different drinks at happy hour?",
          answer:
            "Yes. With a dynamic code you can change the destination yourself at the start and end of happy hour, or keep one menu page and edit the prices. Time-based routing rules on Pro can switch destinations automatically.",
        },
        {
          question: "Do I need a different QR code for every event?",
          answer:
            "No. Print one dynamic code on the permanent poster frame and point it at the next event's page each week. Scans are counted per code, so you also see which nights draw interest.",
        },
      ],
      related: ["menus", "posters", "table-tents", "tickets"],
    },
    {
      slug: "food-trucks",
      name: "Food trucks",
      noun: "food trucks",
      title: "QR codes for food trucks and market stalls",
      seoTitle: "QR Codes for Food Trucks and Market Stalls",
      metaDescription:
        "QR codes for food trucks: tomorrow's location, the menu, payments, social follows and catering enquiries. Sizes that scan from the queue and print tips.",
      summary:
        "Where you'll be tomorrow, menus, payments and catering enquiries.",
      intro: [
        "A food truck's biggest problem is that customers can't find it twice. A QR code painted or stuck on the side of the truck can answer the question every regular asks: where will you be next week?",
        "Trucks also queue people outdoors, in sunlight, at a distance. Codes have to be large, high-contrast and placed where the queue actually stands, usually beside the order window.",
      ],
      useCases: [
        {
          title: "This week's locations",
          description:
            "Point a code on the truck at a page with your schedule and update it each morning. The printed decal never changes.",
        },
        {
          title: "The menu before people reach the window",
          description:
            "A menu code on an A-frame at the back of the queue lets people choose before they order, which shortens the line.",
        },
        {
          title: "Pay by scan",
          description:
            "In India, a UPI code at the window is how most customers pay. Elsewhere, link to your PayPal or card-payment page.",
        },
        {
          title: "Catering and private events",
          description:
            "Weddings and office lunches are where trucks make margin. A code on napkins or the side panel can open a catering enquiry form.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "links",
          why: "Schedule, menu, Instagram and catering form on one page behind the decal, edited from your phone between stops.",
        },
        {
          kind: "static",
          type: "upi",
          why: "Customers pay in any UPI app with your ID and name filled in. Static, free and works without an account.",
        },
        {
          kind: "page",
          page: "menu",
          why: "Prices and sold-out flags you can change mid-service, with allergen tags for the questions you hear at the window.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "A short catering enquiry form: date, headcount and contact details, delivered to your dashboard.",
        },
      ],
      distances: [
        { label: "Order window", meters: 0.6 },
        { label: "A-frame at the back of the queue", meters: 2 },
        { label: "Truck side, from across the street", meters: 5 },
      ],
      tips: [
        "Bright sun creates glare on vinyl. Use a matte laminate on truck decals and avoid placing the code under the awning edge where shadows cut across it.",
        "Put the payment code at hand height on the window ledge so people can scan it while holding their phone at arm's length.",
        "A code on the truck side meant for people across the street needs to be over half a metre wide. If that doesn't fit, aim it at the queue instead.",
        "Print the truck's name or handle as text under the code for people who don't scan.",
      ],
      ctas: [
        "Find us tomorrow: scan for this week's spots",
        "Scan the menu while you wait",
        "Pay with any UPI app",
        "Book us for your event",
      ],
      faqs: [
        {
          question: "What's the best QR code for a food truck?",
          answer:
            "A dynamic code on the truck that opens a page you edit daily: today's location, the menu and your socials. Add a static payment code at the window. The truck decal then never needs to change.",
        },
        {
          question: "Can I accept UPI payments with a QRdx code?",
          answer:
            "Yes. The UPI generator creates a standard upi://pay code with your UPI ID, payee name and an optional fixed amount. It works with any UPI app, is free, and doesn't route money through QRdx.",
        },
        {
          question: "How big should the QR code be on the side of a truck?",
          answer:
            "It depends on the distance. From 5 metres a short-link code needs to be roughly 58 cm wide. If people only scan from the queue, 2 metres away, about 23 cm is enough.",
        },
      ],
      related: ["vehicles", "menus", "stickers", "signs"],
      image: "marketStallUpi",
    },
    {
      slug: "wineries",
      name: "Wineries and beverage brands",
      noun: "wineries and beverage brands",
      title: "QR codes for wineries and beverage brands",
      seoTitle: "QR Codes for Wine and Beverage Labels",
      metaDescription:
        "QR codes on wine, beer and spirits labels: tasting notes, ingredient and nutrition info, cocktail recipes and club sign-ups. Label sizes and copy ideas.",
      summary:
        "Tasting notes, ingredient info, recipes and club sign-ups from the label.",
      intro: [
        "A bottle label has room for a name, a vintage and the legal text, and not much else. A QR code gives it a second label: tasting notes, food pairings, the vineyard story, or the ingredient and nutrition list that some markets now expect producers to make available.",
        "Labels are printed months before a bottle is opened, so the destination has to stay editable. A dynamic code lets each vintage or batch point at the right page, and keeps working long after the run is bottled.",
      ],
      useCases: [
        {
          title: "Tasting notes and pairings",
          description:
            "Link each wine to a page with tasting notes, serving temperature and pairings. Update it when a critic's score or award comes in.",
        },
        {
          title: "Ingredients and nutrition",
          description:
            "Where rules allow information to be provided electronically, a code can open the ingredient and energy list. Check the regulations for each market you sell in.",
        },
        {
          title: "Wine club and cellar door",
          description:
            "A code on the neck tag or back label that opens your club sign-up or the next tasting event turns a bottle bought in a shop into a direct customer.",
        },
        {
          title: "Cocktails for spirits brands",
          description:
            "Spirits labels can link to a video or gallery of cocktail recipes, refreshed for every season.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic link per vintage or batch",
          why: "One code per SKU and vintage, each pointing at its own page. Change the destination if your website moves; the bottles in shops keep working.",
        },
        {
          kind: "page",
          page: "event",
          why: "Cellar-door tastings and harvest events with the date, venue map and calendar buttons.",
        },
        {
          kind: "page",
          page: "video",
          why: "A recipe or vineyard video from YouTube or Vimeo, embedded on a page that loads fast on a phone.",
        },
      ],
      distances: [
        { label: "Bottle held in the hand", meters: 0.2 },
        { label: "Shelf in a wine shop", meters: 0.8 },
      ],
      tips: [
        "Bottles curve. On a standard 75 cl bottle a code much wider than 3 cm starts to wrap out of view; if you need it bigger, use a flat neck tag.",
        "Textured and uncoated wine label papers soften edges. Use solid ink, at least 0.4 mm per module, and proof on the real stock.",
        "Gold foil and embossing look great and scan terribly. Keep them away from the code.",
        "Ask the printer for vector artwork (SVG or PDF) so the code stays sharp at small sizes; QRdx exports both, including CMYK PDF.",
      ],
      ctas: [
        "Scan for tasting notes and pairings",
        "Ingredients and nutrition information",
        "Join the wine club",
        "Three cocktails to make with this bottle",
      ],
      faqs: [
        {
          question:
            "Can a QR code replace the ingredient list on a wine label?",
          answer:
            "Sometimes, partly. In the EU, for example, wine labels must show energy value on the label but can provide the full ingredient and nutrition list through a QR code. Rules differ by country and product, so check with your regulator or trade body before relying on it.",
        },
        {
          question: "Should every vintage have its own QR code?",
          answer:
            "Yes, if the content differs. Separate dynamic codes per vintage or batch let you show the right notes and compliance data, and scan analytics show which wines people look up most.",
        },
        {
          question: "Will the code work on a curved bottle?",
          answer:
            "Phones handle mild curvature, but a wide code wraps around too far to read. Keep it narrow relative to the bottle's diameter, or place it on a flat neck tag, and test on a filled bottle.",
        },
      ],
      related: ["labels", "packaging", "shelves", "catalogs"],
    },
  ],
};
