import { codesFor, framed, official, type TileSpec, tile } from "./build";
import type { PageCode } from "./model";
import { demo, demoAs, place, text, upi, vcard, wifi } from "./values";

/**
 * Four codes on every /qr-codes-for/<industry> and /qr-codes-on/<placement>
 * page, one per job the page recommends (menu, Wi-Fi, reviews, payments and
 * so on), each in a built-in theme with a frame and call to action from the
 * page. No theme repeats within a group of pages, so pages next to each
 * other never look alike.
 *
 * Hosted-page codes open the matching QRdx demo (/templates/<type>/<id>);
 * none opens a file page (PDF, video, audio, images), which needs file
 * storage on the deployment.
 */

const review = (id: "guest-feedback" | "nps-survey") =>
  demoAs("google-review", "feedback", id);
const booking = (id: "professional" | "studio") =>
  demoAs("calcom", "business", id);
const signIn = () => demoAs("attendance", "feedback", "sign-up");
const linkedIn = () => demoAs("linkedin", "vcard", "classic");

const INDUSTRY_TILES: Record<string, TileSpec[]> = {
  // Food and drink
  restaurants: [
    // The theme's own menu card sets its labels in the paper color, on paper,
    // so the card is drawn here with labels in the theme's ink.
    tile(
      "Table menu",
      demo("menu", "restaurant"),
      "restaurantMenu",
      framed("menu-card", "Scan for the menu", "Bon appétit"),
    ),
    tile(
      "Guest Wi-Fi",
      wifi("QRdx Sample Bistro"),
      "mint",
      official("wifi-card", undefined, "QRdx Sample Bistro"),
    ),
    tile(
      "Reviews",
      review("guest-feedback"),
      "rose",
      official("review-us", "Enjoyed it? Review us"),
    ),
    tile(
      "Order at the table",
      demo("menu", "cafe"),
      "terracotta",
      official("order-at-table"),
    ),
  ],
  "coffee-shops": [
    tile(
      "Free Wi-Fi",
      wifi("QRdx Sample Coffee"),
      "butter",
      official("wifi-card", "Free Wi-Fi", "QRdx Sample Coffee"),
    ),
    tile(
      "Order ahead",
      demo("apps", "app-launch"),
      "amberMinimal",
      framed("phone", "Order ahead"),
    ),
    tile(
      "Loyalty club",
      demo("links", "minimal"),
      "pastelDream",
      framed("badge", "10th coffee free"),
    ),
    tile(
      "Meet the farm",
      demoAs("instagram", "links", "creator"),
      "gradientSunset",
      official("follow-us", "Meet the farm"),
    ),
  ],
  bars: [
    tile(
      "On tap",
      demo("menu", "bar"),
      "bordeaux",
      framed("menu-card", "On tap tonight", "Scan the menu"),
    ),
    tile(
      "Quiz night",
      demo("event", "party"),
      "vibrant",
      framed("ticket", "Quiz every Tuesday"),
    ),
    tile(
      "Another round",
      demo("menu", "juice-bar"),
      "jade",
      official("order-at-table", "Order a round", "Table 4"),
    ),
    tile(
      "Reviews",
      review("nps-survey"),
      "gilt",
      official("review-us", "Good night? Review us"),
    ),
  ],
  "food-trucks": [
    tile(
      "This week's spots",
      demo("links", "shop"),
      "fire",
      framed("speech-bubble", "Find us tomorrow"),
    ),
    tile(
      "Pay by UPI",
      upi("Sample Truck"),
      "emerald",
      official("scan-to-pay", "Pay with any UPI app"),
    ),
    tile(
      "Menu",
      demo("menu", "juice-bar"),
      "tropical",
      framed("menu-card", "Today's menu", "Order at the window"),
    ),
    tile(
      "Book the truck",
      demo("feedback", "sign-up"),
      "sunset",
      official("book-now", "Book us for events"),
    ),
  ],
  wineries: [
    tile(
      "Tasting notes",
      demo("links", "minimal"),
      "royal",
      official("product-info", "Tasting notes"),
    ),
    tile(
      "Wine club",
      demo("event", "party"),
      "amethystHaze",
      official("rsvp-card", "Join the wine club"),
    ),
    tile(
      "Cellar tour",
      demo("event", "conference"),
      "gradientPurple",
      official("event-ticket", "Cellar tour", "Book a tasting"),
    ),
    tile(
      "Bottle label",
      demo("links", "shop"),
      "folio",
      framed("border", "Ingredients & nutrition"),
    ),
  ],

  // Hospitality and travel
  hotels: [
    tile(
      "Room Wi-Fi",
      wifi("QRdx Sample Hotel"),
      "harbor",
      official("wifi-card", undefined, "QRdx Sample Hotel"),
    ),
    tile(
      "Your stay",
      demo("links", "minimal"),
      "gilt",
      official("check-in", "Your stay, one scan"),
    ),
    tile(
      "Room service",
      demo("menu", "restaurant"),
      "terracotta",
      official("order-at-table", "Order room service", "Room 214"),
    ),
    tile(
      "Feedback",
      demo("feedback", "guest-feedback"),
      "slate",
      official("feedback-bubble", "How was your stay?"),
    ),
  ],
  tourism: [
    tile(
      "Audio guide",
      demo("links", "podcast"),
      "nature",
      official("audio-guide", "Hear the story"),
    ),
    tile(
      "Trail map",
      place("goldenGatePark"),
      "gradientForest",
      framed("circle", "Trail map", "Start here"),
    ),
    tile(
      "Opening times",
      demo("business", "local-shop"),
      "sunset",
      framed("banner-top-bottom", "Opening times", "Tickets inside"),
    ),
    tile("Local offer", demo("coupon", "free-item"), "retailSale"),
  ],
  museums: [
    tile(
      "Curator's tour",
      demo("custom", "announcement"),
      "monochrome",
      official("audio-guide", "Listen to the curator"),
    ),
    tile(
      "Gallery map",
      demo("business", "studio"),
      "folio",
      official("sign-rider", "Gallery map", "Today's talks"),
    ),
    tile(
      "Talks",
      demo("event", "webinar"),
      "lavender",
      official("event-ticket", "Today's talks", "Free entry"),
    ),
    tile(
      "Support us",
      demo("coupon", "member-offer"),
      "jade",
      official("donate", "Support the museum"),
    ),
  ],
  events: [
    tile("Ticket", demo("event", "conference"), "eventTicket"),
    tile(
      "Badge contact",
      vcard("Alex", "Example", "alex@example.com"),
      "amberMinimal",
      framed("badge", "Scan my badge"),
    ),
    tile(
      "Rate a session",
      demo("feedback", "nps-survey"),
      "ice",
      official("feedback-bubble", "Rate this session"),
    ),
    tile(
      "Check-in",
      signIn(),
      "boldTech",
      official("attendance", "Sign in at the door"),
    ),
  ],
  weddings: [
    tile("RSVP", demo("event", "wedding"), "sweetheart", official("rsvp-card")),
    tile(
      "Photos",
      demo("custom", "announcement"),
      "rose",
      framed("polaroid", "Share your photos"),
    ),
    tile(
      "Directions",
      place("goldenGatePark"),
      "royal",
      framed("banner-bottom", "Directions & parking"),
    ),
    tile(
      "Registry",
      demo("links", "shop"),
      "pastelDream",
      framed("tag", "Our gift registry"),
    ),
  ],

  // Community and public services
  healthcare: [
    tile(
      "Aftercare",
      demo("custom", "announcement"),
      "mint",
      official("product-info", "Aftercare instructions"),
    ),
    tile(
      "Appointments",
      demo("business", "professional"),
      "modern",
      official("book-now", "Book or change a visit"),
    ),
    tile(
      "Patient Wi-Fi",
      wifi("QRdx Sample Clinic"),
      "ice",
      official("wifi-card", undefined, "QRdx Sample Clinic"),
    ),
    tile(
      "Feedback",
      demo("feedback", "guest-feedback"),
      "emerald",
      official("feedback-bubble", "How did we do?"),
    ),
  ],
  pharma: [
    tile(
      "Patient leaflet",
      demo("custom", "announcement"),
      "slate",
      official("product-info", "Patient leaflet"),
    ),
    tile(
      "How to use it",
      demo("apps", "wellness"),
      "twitter",
      framed("phone", "Watch how to use it"),
    ),
    tile(
      "Large print",
      demo("links", "minimal"),
      "folio",
      framed("border", "Large print & languages"),
    ),
    tile(
      "Register",
      demo("feedback", "sign-up"),
      "harbor",
      official("register-product"),
    ),
  ],
  education: [
    tile(
      "Class sign-in",
      signIn(),
      "classic",
      official("attendance", "Sign in for class"),
    ),
    tile(
      "Today's reading",
      demoAs("google-drive", "custom", "announcement"),
      "butter",
      official("product-info", "Today's reading"),
    ),
    tile(
      "Open day",
      demo("event", "conference"),
      "gradientBlue",
      official("event-ticket", "Open day", "Book your place"),
    ),
    tile(
      "Class page",
      demo("links", "minimal"),
      "candyland",
      framed("speech-bubble", "Class resources"),
    ),
  ],
  government: [
    tile(
      "Have your say",
      demo("feedback", "nps-survey"),
      "monochrome",
      official("feedback-bubble", "Have your say"),
    ),
    tile(
      "Collection days",
      demo("custom", "announcement"),
      "nature",
      official("sign-rider", "Collection days", "For this street"),
    ),
    tile(
      "Report a problem",
      demo("feedback", "guest-feedback"),
      "retro",
      framed("banner-bottom", "Report a problem"),
    ),
    tile(
      "Find the office",
      place("sfCityHall"),
      "fog",
      official("check-in", "Find the office"),
    ),
  ],
  nonprofits: [
    tile(
      "Donate",
      upi("Sample Charity"),
      "sunset",
      official("donate", "Give in a minute"),
    ),
    tile(
      "Volunteer",
      demo("feedback", "sign-up"),
      "gradientForest",
      framed("speech-bubble-top", "Join our volunteers"),
    ),
    tile(
      "Charity run",
      demo("event", "party"),
      "popsicle",
      official("event-ticket", "Charity run", "Sign up today"),
    ),
    tile(
      "Your impact",
      demo("custom", "announcement"),
      "lavender",
      framed("banner-bottom", "See your impact"),
    ),
  ],
  churches: [
    tile(
      "Give",
      upi("Sample Parish"),
      "gilt",
      official("donate", "Scan to give"),
    ),
    tile(
      "Bulletin",
      demo("custom", "announcement"),
      "amberMinimal",
      framed("menu-card", "This week's bulletin", "Welcome"),
    ),
    tile(
      "Sermons",
      demo("links", "podcast"),
      "amethystHaze",
      official("audio-guide", "Sunday's sermon"),
    ),
    tile(
      "Prayer requests",
      demo("feedback", "guest-feedback"),
      "rose",
      official("feedback-bubble", "Share a prayer request"),
    ),
  ],

  // Professional services
  "real-estate": [
    tile(
      "Agent contact",
      vcard("Riya", "Sample", "riya@example.com"),
      "royal",
      official("save-contact"),
    ),
    tile(
      "Sign rider",
      demo("vcard", "realtor"),
      "realEstate",
      official("sign-rider", "Photos and floor plan", "Book a viewing"),
    ),
    tile(
      "Open house",
      demo("event", "party"),
      "harbor",
      official("event-ticket", "Open house", "Book a viewing"),
    ),
    tile(
      "Window card",
      demo("business", "local-shop"),
      "jade",
      official("shop-window", "Scan for details"),
    ),
  ],
  "marketing-agencies": [
    tile(
      "Offer",
      demo("coupon", "store-discount"),
      "electric",
      framed("tag", "Claim 20% off"),
    ),
    tile(
      "Giveaway",
      demo("feedback", "sign-up"),
      "vibrant",
      framed("sticker", "Enter the giveaway"),
    ),
    tile(
      "App install",
      demo("apps", "app-launch"),
      "gradientPurple",
      official("get-the-app"),
    ),
    tile(
      "Campaign page",
      demo("links", "creator"),
      "boldTech",
      framed("focus", "See it in action"),
    ),
  ],
  "law-firms": [
    tile(
      "Contact card",
      vcard("Jo", "Example", "jo@example.com"),
      "folio",
      official("save-contact"),
    ),
    tile(
      "Consultation",
      booking("professional"),
      "bordeaux",
      official("book-now", "Book a consultation"),
    ),
    tile(
      "Seminar",
      demo("event", "webinar"),
      "slate",
      official("rsvp-card", "Register for the seminar"),
    ),
    tile(
      "Guide",
      demo("custom", "announcement"),
      "amberMinimal",
      framed("banner-bottom", "Read our guide"),
    ),
  ],
  banks: [
    tile(
      "Banking app",
      demo("apps", "wellness"),
      "twitter",
      official("get-the-app", "Get our app"),
    ),
    tile(
      "Book an adviser",
      booking("professional"),
      "monochrome",
      official("book-now", "Book an adviser"),
    ),
    tile(
      "Today's rates",
      demo("custom", "announcement"),
      "emerald",
      framed("banner-top", "Today's rates"),
    ),
    tile(
      "Branch hours",
      demo("business", "local-shop"),
      "gilt",
      official("check-in", "Branch hours"),
    ),
  ],

  // Retail and consumer
  retail: [
    tile("Window sale", demo("coupon", "store-discount"), "retailSale"),
    tile(
      "Shop the window",
      demo("links", "shop"),
      "spiderman",
      official("shop-window", "Shop this window"),
    ),
    tile(
      "Rewards club",
      demo("coupon", "member-offer"),
      "candyland",
      framed("badge", "Join our rewards"),
    ),
    tile(
      "Sizes and reviews",
      demo("business", "local-shop"),
      "minimal",
      official("product-info", "Sizes and reviews"),
    ),
  ],
  cosmetics: [
    tile(
      "Ingredients",
      demo("custom", "announcement"),
      "rose",
      official("product-info", "Full ingredient guide"),
    ),
    tile(
      "Shade finder",
      demo("links", "creator"),
      "gradientSunset",
      framed("sticker", "Find your shade"),
    ),
    tile(
      "How to apply",
      demo("links", "minimal"),
      "bubblegum",
      framed("phone", "Watch how to apply"),
    ),
    tile(
      "Refill",
      demo("feedback", "sign-up"),
      "mint",
      framed("tag", "Refill or recycle"),
    ),
  ],
  salons: [
    tile(
      "Next visit",
      booking("studio"),
      "lavender",
      official("book-now", "Book your next visit"),
    ),
    tile(
      "Our work",
      demo("links", "creator"),
      "sweetheart",
      framed("polaroid", "See our work"),
    ),
    tile(
      "Reviews",
      review("guest-feedback"),
      "pastelDream",
      official("review-us"),
    ),
    tile(
      "Price list",
      demo("business", "studio"),
      "amethystHaze",
      framed("menu-card", "Prices", "Treatments"),
    ),
  ],
  gyms: [
    tile(
      "Class timetable",
      demo("links", "minimal"),
      "fire",
      framed("banner-top-bottom", "Today's classes", "Book a spot"),
    ),
    tile(
      "Machine demo",
      demo("apps", "wellness"),
      "electric",
      framed("phone", "Watch the demo"),
    ),
    tile(
      "Report a fault",
      demo("feedback", "guest-feedback"),
      "slate",
      official("feedback-bubble", "Something broken?"),
    ),
    tile(
      "Free week",
      demo("coupon", "free-item"),
      "vibrant",
      framed("ticket", "Try a week free"),
    ),
  ],
  automotive: [
    tile(
      "Window sticker",
      demo("business", "local-shop"),
      "ice",
      official("sign-rider", "Specs and walkaround", "Book a test drive"),
    ),
    tile(
      "Test drive",
      booking("professional"),
      "retro",
      official("book-now", "Book a test drive"),
    ),
    tile(
      "Service",
      demo("feedback", "sign-up"),
      "twitter",
      official("register-product", "Book your service"),
    ),
    tile(
      "Reviews",
      review("nps-survey"),
      "monochrome",
      official("review-us", "How did we do?"),
    ),
  ],

  // Industrial
  manufacturing: [
    tile(
      "Manual",
      demo("custom", "announcement"),
      "minimal",
      official("product-info", "Manual and spare parts"),
    ),
    tile(
      "Setup video",
      demo("apps", "app-launch"),
      "modern",
      framed("phone", "2-minute setup video"),
    ),
    tile(
      "Warranty",
      demo("feedback", "sign-up"),
      "slate",
      official("register-product", "Register your warranty"),
    ),
    tile(
      "Maintenance",
      demo("links", "minimal"),
      "fog",
      framed("border", "Maintenance steps"),
    ),
  ],
  logistics: [
    tile(
      "Rebook",
      demo("business", "local-shop"),
      "sunset",
      framed("tag", "Missed us? Rebook"),
    ),
    tile(
      "Returns",
      demo("feedback", "sign-up"),
      "electric",
      framed("sticker", "Start a return"),
    ),
    tile(
      "Driver info",
      demo("custom", "announcement"),
      "monochrome",
      official("sign-rider", "Driver information", "For this site"),
    ),
    tile(
      "Incidents",
      demo("feedback", "guest-feedback"),
      "retro",
      official("feedback-bubble", "Report an incident"),
    ),
  ],
  construction: [
    tile(
      "Site induction",
      signIn(),
      "butter",
      official("attendance", "Sign in before entry"),
    ),
    tile(
      "Risk assessment",
      demo("custom", "announcement"),
      "fire",
      official("product-info", "Current risk assessment"),
    ),
    tile(
      "Ladder check",
      demo("feedback", "guest-feedback"),
      "pacman",
      framed("tag", "Inspect this ladder"),
    ),
    tile(
      "Site hoarding",
      demo("custom", "coming-soon"),
      "harbor",
      official("sign-rider", "Homes coming soon", "Scan for prices"),
    ),
  ],
  agriculture: [
    tile(
      "Meet the farm",
      demo("business", "florist"),
      "nature",
      framed("polaroid", "Meet the farm"),
    ),
    tile(
      "Farm stall",
      upi("Sample Farm Stall"),
      "gradientForest",
      official("scan-to-pay", "Pay with any UPI app"),
    ),
    tile(
      "In season",
      demo("links", "minimal"),
      "tropical",
      framed("menu-card", "In season", "This week"),
    ),
    tile(
      "Veg box",
      demo("feedback", "sign-up"),
      "mint",
      framed("badge", "Join the veg box"),
    ),
  ],
  transportation: [
    tile(
      "Departures",
      demo("links", "minimal"),
      "gradientBlue",
      framed("focus", "Live departures"),
    ),
    tile(
      "Parking",
      demo("apps", "app-launch"),
      "ice",
      official("scan-to-pay", "Pay for parking"),
    ),
    tile(
      "Service changes",
      demo("custom", "announcement"),
      "royal",
      framed("banner-top", "Service changes today"),
    ),
    tile(
      "Report a problem",
      demo("feedback", "guest-feedback"),
      "boldTech",
      framed("speech-bubble", "Report a problem"),
    ),
  ],
};

const PLACEMENT_TILES: Record<string, TileSpec[]> = {
  // Print marketing
  "business-cards": [
    tile(
      "Contact",
      vcard("Riya", "Sample", "riya@example.com"),
      "businessCard",
    ),
    tile(
      "Portfolio",
      demo("vcard", "minimal"),
      "gilt",
      framed("polaroid", "See my portfolio"),
    ),
    tile(
      "Book a call",
      booking("professional"),
      "harbor",
      official("book-now", "Book a call with me"),
    ),
    tile(
      "LinkedIn",
      linkedIn(),
      "twitter",
      framed("badge", "Connect on LinkedIn"),
    ),
  ],
  flyers: [
    tile(
      "2-for-1",
      demo("coupon", "free-item"),
      "fire",
      framed("tag", "2-for-1 this week"),
    ),
    tile(
      "Programme",
      demo("event", "party"),
      "eventTicket",
      framed("ticket", "Full programme"),
    ),
    tile(
      "Trial class",
      demo("feedback", "sign-up"),
      "mint",
      framed("sticker", "Free trial class"),
    ),
    tile(
      "Order online",
      demo("menu", "cafe"),
      "caffeine",
      framed("menu-card", "Order online", "From our menu"),
    ),
  ],
  posters: [
    tile(
      "Tickets",
      demo("event", "party"),
      "vibrant",
      official("event-ticket", "Get tickets"),
    ),
    tile(
      "Apply",
      demo("feedback", "sign-up"),
      "modern",
      framed("banner-bottom", "Apply in 2 minutes"),
    ),
    tile(
      "Get the app",
      demo("apps", "game"),
      "gradientPurple",
      official("get-the-app"),
    ),
    tile(
      "Petition",
      demo("feedback", "nps-survey"),
      "retro",
      framed("speech-bubble-top", "Sign the petition"),
    ),
  ],
  brochures: [
    tile(
      "Price list",
      demo("business", "local-shop"),
      "amberMinimal",
      framed("banner-top-bottom", "Today's prices", "Updated daily"),
    ),
    tile(
      "Tour",
      demo("links", "minimal"),
      "slate",
      framed("phone", "Watch the tour"),
    ),
    tile(
      "Specifications",
      demo("custom", "announcement"),
      "monochrome",
      official("product-info", "Full specifications"),
    ),
    tile(
      "Book a visit",
      booking("studio"),
      "jade",
      official("book-now", "Book your visit"),
    ),
  ],
  catalogs: [
    tile(
      "Scan to buy",
      demo("links", "shop"),
      "spiderman",
      official("shop-window", "Scan to buy"),
    ),
    tile(
      "More photos",
      demo("links", "creator"),
      "gradientOcean",
      framed("polaroid", "See more photos"),
    ),
    tile(
      "Reorder",
      demo("business", "florist"),
      "sunset",
      framed("sticker", "Reorder in one scan"),
    ),
    tile(
      "Bulk quote",
      demo("feedback", "sign-up"),
      "folio",
      framed("banner-bottom", "Request a quote"),
    ),
  ],
  "direct-mail": [
    tile(
      "Welcome offer",
      demo("coupon", "member-offer"),
      "gradientSunset",
      framed("envelope", "Your welcome offer"),
    ),
    tile(
      "Get a quote",
      demo("feedback", "sign-up"),
      "ice",
      framed("tag", "Quote in 2 minutes"),
    ),
    tile(
      "Appeal",
      upi("Sample Appeal"),
      "rose",
      official("donate", "Give to this appeal"),
    ),
    tile(
      "Free survey",
      booking("professional"),
      "nature",
      official("book-now", "Book a free survey"),
    ),
  ],
  magazines: [
    tile(
      "Shop the look",
      demo("links", "shop"),
      "bordeaux",
      official("shop-window", "Shop this look"),
    ),
    tile(
      "Recipe",
      demo("menu", "juice-bar"),
      "butter",
      framed("menu-card", "Get the recipe", "Watch it made"),
    ),
    tile(
      "Subscribe",
      demo("coupon", "member-offer"),
      "royal",
      framed("banner-bottom", "Subscribe for half price"),
    ),
    tile(
      "Competition",
      demo("feedback", "sign-up"),
      "candyland",
      framed("sticker", "Enter the competition"),
    ),
  ],

  // Products and packaging
  packaging: [
    tile(
      "Setup video",
      demo("apps", "app-launch"),
      "harbor",
      framed("phone", "2-minute setup"),
    ),
    tile(
      "Origin",
      demo("business", "florist"),
      "nature",
      framed("polaroid", "Where this comes from"),
    ),
    tile(
      "Reorder",
      demo("links", "shop"),
      "sunset",
      framed("sticker", "Running low? Reorder"),
    ),
    tile(
      "Recycling",
      demo("custom", "announcement"),
      "mint",
      framed("tag", "How to recycle this"),
    ),
  ],
  labels: [
    tile(
      "Allergens",
      demo("menu", "restaurant"),
      "terracotta",
      official("product-info", "Allergens & ingredients"),
    ),
    tile(
      "Care label",
      demo("custom", "announcement"),
      "fog",
      framed("border", "Care instructions"),
    ),
    tile(
      "Maker",
      demoAs("etsy", "business", "florist"),
      "pastelDream",
      framed("polaroid", "Meet the maker"),
    ),
    tile(
      "Service history",
      demo("feedback", "sign-up"),
      "slate",
      official("register-product", "Service history"),
    ),
  ],
  "product-manuals": [
    tile(
      "Step video",
      demo("apps", "app-launch"),
      "modern",
      framed("phone", "Stuck? Watch this step"),
    ),
    tile(
      "Translations",
      demo("custom", "announcement"),
      "minimal",
      official("product-info", "Manual in your language"),
    ),
    tile(
      "Spare parts",
      demo("links", "shop"),
      "amberMinimal",
      official("shop-window", "Order spare parts"),
    ),
    tile(
      "Support",
      demo("feedback", "guest-feedback"),
      "twitter",
      official("feedback-bubble", "Troubleshooting"),
    ),
  ],
  stickers: [
    tile(
      "Pay here",
      upi("Sample Stall"),
      "emerald",
      framed("sticker", "Scan to pay"),
    ),
    tile(
      "Report a problem",
      demo("feedback", "guest-feedback"),
      "retro",
      framed("speech-bubble", "Report a problem"),
    ),
    tile(
      "Community",
      demo("links", "creator"),
      "gradientPurple",
      framed("circle", "Join us", "Scan me"),
    ),
    tile(
      "Manual",
      demo("custom", "announcement"),
      "ice",
      framed("tag", "Scan for the manual"),
    ),
  ],
  mugs: [
    tile(
      "Brewing guide",
      demo("menu", "cafe"),
      "caffeine",
      framed("polaroid", "Our brewing guide"),
    ),
    tile(
      "A message",
      text("A message for you: thanks for being here."),
      "sweetheart",
      framed("speech-bubble", "A message for you"),
    ),
    tile(
      "Early tickets",
      demo("event", "party"),
      "eventTicket",
      framed("ticket", "Early tickets"),
    ),
    tile(
      "Shop",
      demo("links", "shop"),
      "jade",
      framed("banner-bottom", "Shop the collection"),
    ),
  ],
  "t-shirts": [
    tile(
      "Follow us",
      demoAs("instagram", "links", "creator"),
      "instagram",
      official("follow-us"),
    ),
    tile(
      "Hiring",
      demo("feedback", "sign-up"),
      "electric",
      framed("banner-bottom", "We're hiring"),
    ),
    tile(
      "Playlist",
      demo("links", "musician"),
      "gradientForest",
      framed("circle", "The playlist", "Press play"),
    ),
    tile(
      "Sponsor me",
      upi("Sample Runner"),
      "popsicle",
      official("donate", "Sponsor me"),
    ),
  ],

  // In store and hospitality
  menus: [
    tile(
      "Menu",
      demo("menu", "cafe"),
      "gilt",
      framed("menu-card", "Menu & specials", "Bon appétit"),
    ),
    tile(
      "Allergens",
      demo("menu", "restaurant"),
      "rose",
      official("product-info", "Allergens and drinks"),
    ),
    tile(
      "Table ordering",
      demo("menu", "bar"),
      "terracotta",
      official("order-at-table", undefined, "Table 7"),
    ),
    tile(
      "Wi-Fi",
      wifi("QRdx Sample Diner"),
      "retro",
      official("wifi-card", undefined, "QRdx Sample Diner"),
    ),
  ],
  "table-tents": [
    tile(
      "Table tent",
      demo("menu", "cafe"),
      "caffeine",
      official("table-tent", "Menu and specials"),
    ),
    tile(
      "Free Wi-Fi",
      wifi("QRdx Sample Bar"),
      "harbor",
      framed("rounded-border", "Free Wi-Fi"),
    ),
    tile("Reviews", review("guest-feedback"), "butter", official("review-us")),
    tile(
      "Live music",
      demo("event", "party"),
      "gradientPurple",
      official("event-ticket", "Live music Friday"),
    ),
  ],
  receipts: [
    tile(
      "Review",
      review("nps-survey"),
      "folio",
      official("review-us", "How did we do?"),
    ),
    tile(
      "Next visit",
      demo("coupon", "store-discount"),
      "retailSale",
      framed("tag", "10% off next visit"),
    ),
    tile(
      "Returns",
      demo("feedback", "sign-up"),
      "minimal",
      framed("banner-bottom", "Easy returns"),
    ),
    tile(
      "Survey",
      demo("feedback", "guest-feedback"),
      "lavender",
      official("feedback-bubble", "Two quick questions"),
    ),
  ],
  shelves: [
    tile(
      "Compare",
      demo("business", "local-shop"),
      "twitter",
      framed("tag", "Compare here"),
    ),
    tile(
      "Reviews",
      demo("links", "shop"),
      "gradientOcean",
      official("review-us", "See reviews"),
    ),
    tile(
      "Recipe idea",
      demo("menu", "juice-bar"),
      "tropical",
      framed("menu-card", "What to cook", "With this"),
    ),
    tile(
      "Offer",
      demo("coupon", "free-item"),
      "spiderman",
      framed("sticker", "Today's offer"),
    ),
  ],
  "window-decals": [
    tile(
      "Shop after hours",
      demo("business", "local-shop"),
      "royal",
      official("shop-window", "Shop while we're closed"),
    ),
    tile(
      "Opening hours",
      demo("business", "florist"),
      "slate",
      official("check-in", "Opening hours"),
    ),
    tile(
      "Book a table",
      demo("menu", "restaurant"),
      "bordeaux",
      official("book-now", "Book a table"),
    ),
    tile(
      "Links",
      demo("links", "minimal"),
      "amethystHaze",
      framed("focus", "Scan here"),
    ),
  ],

  // Documents and tickets
  invoices: [
    tile(
      "Pay by UPI",
      upi("Sample Studio"),
      "emerald",
      official("scan-to-pay", "Pay with any UPI app"),
    ),
    tile(
      "Pay online",
      demoAs("paypal", "business", "professional"),
      "gradientBlue",
      framed("banner-bottom", "Pay this invoice"),
    ),
    tile(
      "Your account",
      demo("vcard", "classic"),
      "monochrome",
      framed("rounded-border", "View your account"),
    ),
    tile(
      "Feedback",
      demo("feedback", "guest-feedback"),
      "jade",
      official("feedback-bubble", "How did we do?"),
    ),
  ],
  certificates: [
    tile(
      "Verify",
      demo("custom", "announcement"),
      "royal",
      official("register-product", "Verify this certificate"),
    ),
    tile(
      "Digital original",
      demo("vcard", "minimal"),
      "gilt",
      framed("border", "View the original"),
    ),
    tile(
      "LinkedIn",
      linkedIn(),
      "twitter",
      framed("banner-top", "Add to LinkedIn"),
    ),
    tile("Course page", demo("event", "webinar"), "amberMinimal", null),
  ],
  tickets: [
    tile(
      "Set times",
      demo("event", "party"),
      "eventTicket",
      framed("ticket", "Set times & site map"),
    ),
    tile(
      "Getting here",
      place("goldenGatePark"),
      "gradientForest",
      framed("banner-top-bottom", "Getting here", "And parking"),
    ),
    tile(
      "Event info",
      demo("links", "musician"),
      "vibrant",
      official("event-ticket", "Event info", "Not for entry"),
    ),
    tile(
      "Merch",
      demo("links", "shop"),
      "candyland",
      framed("tag", "Merch stand"),
    ),
  ],
  badges: [
    tile(
      "Save my contact",
      vcard("Alex", "Example", "alex@example.com"),
      "modern",
      framed("polaroid", "Save my contact"),
    ),
    tile(
      "Connect",
      linkedIn(),
      "harbor",
      official("save-contact", "Let's connect"),
    ),
    tile(
      "Agenda",
      demo("event", "conference"),
      "lavender",
      official("event-ticket", "Live agenda"),
    ),
    tile(
      "Speaker",
      demo("vcard", "midnight"),
      "boldTech",
      framed("polaroid", "Meet the speaker"),
    ),
  ],
  envelopes: [
    tile("RSVP", demo("event", "wedding"), "rose", official("rsvp-card")),
    tile(
      "Preview",
      demo("custom", "announcement"),
      "pastelDream",
      framed("envelope", "Scan for a preview"),
    ),
    tile(
      "Reply online",
      demo("feedback", "sign-up"),
      "fog",
      framed("banner-bottom", "Reply online"),
    ),
    tile(
      "Paperless",
      demo("feedback", "nps-survey"),
      "nature",
      framed("sticker", "Go paperless"),
    ),
  ],
  books: [
    tile(
      "Read aloud",
      demo("links", "podcast"),
      "amethystHaze",
      official("audio-guide", "Hear it read aloud"),
    ),
    tile(
      "Technique",
      demo("apps", "app-launch"),
      "ice",
      framed("phone", "Watch the technique"),
    ),
    tile(
      "Corrections",
      demo("custom", "announcement"),
      "folio",
      framed("border", "Corrections"),
    ),
    tile(
      "Next book",
      demo("feedback", "sign-up"),
      "butter",
      framed("banner-bottom", "Get the next book first"),
    ),
  ],

  // Outdoor
  billboards: [
    tile("First order", demo("coupon", "store-discount"), "retailSale"),
    tile(
      "Get the app",
      demo("apps", "app-launch"),
      "gradientPurple",
      official("get-the-app"),
    ),
    tile(
      "Directions",
      place("goldenGatePark"),
      "sunset",
      framed("banner-bottom", "Scan for directions"),
    ),
    tile(
      "Waitlist",
      demo("custom", "coming-soon"),
      "monochrome",
      framed("focus", "Join the waitlist"),
    ),
  ],
  vehicles: [
    tile(
      "Book a job",
      booking("professional"),
      "modern",
      official("book-now", "Need a plumber?"),
    ),
    tile(
      "Reviews",
      demo("feedback", "guest-feedback"),
      "butter",
      official("review-us", "See our reviews"),
    ),
    tile(
      "Free quote",
      demo("feedback", "sign-up"),
      "fire",
      framed("banner-top-bottom", "Free quote", "Scan me"),
    ),
    tile(
      "Driving feedback",
      demo("feedback", "nps-survey"),
      "slate",
      framed("speech-bubble", "How's my driving?"),
    ),
  ],
  signs: [
    tile(
      "Trail route",
      place("goldenGatePark"),
      "nature",
      official("sign-rider", "Scan for the route", "Trail map"),
    ),
    tile(
      "Opening hours",
      demo("business", "local-shop"),
      "harbor",
      official("check-in", "Opening hours"),
    ),
    tile(
      "Audio guide",
      demo("links", "podcast"),
      "jade",
      official("audio-guide", "Listen to the guide"),
    ),
    tile(
      "Safety",
      demo("custom", "announcement"),
      "retro",
      official("product-info", "Safety procedure"),
    ),
  ],

  // Screens
  emails: [
    tile(
      "Get the app",
      demo("apps", "app-launch"),
      "boldTech",
      official("get-the-app", "On a computer? Get it"),
    ),
    tile(
      "Office Wi-Fi",
      wifi("QRdx Sample Office"),
      "ice",
      official("wifi-card", undefined, "QRdx Sample Office"),
    ),
    tile(
      "Event details",
      demo("event", "webinar"),
      "gradientBlue",
      official("event-ticket", "Your event details"),
    ),
    tile(
      "Continue on phone",
      demo("links", "minimal"),
      "classic",
      framed("phone", "Continue on your phone"),
    ),
  ],
  presentations: [
    tile(
      "Slides",
      demo("custom", "announcement"),
      "slate",
      framed("banner-bottom", "Slides and resources"),
    ),
    tile(
      "Rate this talk",
      demo("feedback", "nps-survey"),
      "lavender",
      official("feedback-bubble", "Rate this talk"),
    ),
    tile(
      "Connect",
      vcard("Jo", "Example", "jo@example.com"),
      "harbor",
      official("save-contact", "Let's connect"),
    ),
    tile(
      "Questions",
      demo("feedback", "guest-feedback"),
      "amberMinimal",
      framed("speech-bubble", "Ask a question"),
    ),
  ],
  "tv-and-video": [
    tile(
      "On-screen offer",
      demo("coupon", "store-discount"),
      "electric",
      framed("tag", "Scan now for 20% off"),
    ),
    tile(
      "Get the app",
      demo("apps", "game"),
      "gradientOcean",
      official("get-the-app"),
    ),
    tile(
      "Vote",
      demo("feedback", "nps-survey"),
      "vibrant",
      framed("circle", "Vote now", "Scan me"),
    ),
    tile(
      "Recipe",
      demo("menu", "juice-bar"),
      "tropical",
      framed("menu-card", "Tonight's recipe", "From the episode"),
    ),
  ],
};

const build = (prefix: string, tiles: Record<string, TileSpec[]>) =>
  Object.fromEntries(
    Object.entries(tiles).map(([slug, list]) => [
      slug,
      codesFor(`${prefix}-${slug}`, list),
    ]),
  ) as Record<string, PageCode[]>;

/** Codes for /qr-codes-for/<slug>, by slug. */
export const INDUSTRY_CODES = build("for", INDUSTRY_TILES);

/** Codes for /qr-codes-on/<slug>, by slug. */
export const PLACEMENT_CODES = build("on", PLACEMENT_TILES);
