// The new official frames: id, name, layout, labels, motif and colors.
// Descriptions are written from the layout, the motif and the colors.
import {
  addIndustryFrames,
  INDUSTRY_LAYOUT_PLAIN,
  INDUSTRY_LAYOUT_WORDS,
  INDUSTRY_MOTIF_WORDS,
} from "./catalogue-industries.mjs";

const MONO = { frame: "#111111", text: "#ffffff", accent: "#111111", word: "" };
const SOFT = { frame: "#111111", text: "#ffffff", accent: "#8a8a8a", word: "" };
const NEON = { frame: "#111111", text: "#ffffff", accent: "#ececec", word: "" };
const GREY = { frame: "#2b2b2b", text: "#ffffff", accent: "#b5b5b5", word: "" };

const P = {
  xmasRed: {
    frame: "#9e1b32",
    text: "#ffffff",
    accent: "#1f5135",
    word: "cranberry red and pine green",
  },
  xmasPine: {
    frame: "#1f4d3a",
    text: "#ffffff",
    accent: "#b8862b",
    word: "pine green and gold",
  },
  xmasNight: {
    frame: "#14213d",
    text: "#ffffff",
    accent: "#c9a227",
    word: "midnight blue and gold",
  },
  nyGold: {
    frame: "#111111",
    text: "#ffffff",
    accent: "#c9a227",
    word: "black and gold",
  },
  nyNavy: {
    frame: "#1b2a4a",
    text: "#ffffff",
    accent: "#d4af37",
    word: "navy and gold",
  },
  lunarRed: {
    frame: "#b3261e",
    text: "#ffffff",
    accent: "#e0a526",
    word: "vermilion and gold",
  },
  lunarDeep: {
    frame: "#8f1d14",
    text: "#ffffff",
    accent: "#d4a017",
    word: "deep red and gold",
  },
  diwali: {
    frame: "#7a1f3d",
    text: "#ffffff",
    accent: "#f0a53a",
    word: "maroon and marigold",
  },
  diwaliSaffron: {
    frame: "#9a3f07",
    text: "#ffffff",
    accent: "#f2b33d",
    word: "saffron and gold",
  },
  holiPink: {
    frame: "#be185d",
    text: "#ffffff",
    accent: "#0f766e",
    word: "magenta and teal",
  },
  holiViolet: {
    frame: "#6d28d9",
    text: "#ffffff",
    accent: "#f59e0b",
    word: "violet and amber",
  },
  eidEmerald: {
    frame: "#0f5f4a",
    text: "#ffffff",
    accent: "#c9a227",
    word: "emerald and gold",
  },
  eidNight: {
    frame: "#1e2a5a",
    text: "#ffffff",
    accent: "#d4af37",
    word: "night blue and gold",
  },
  ramadan: {
    frame: "#26215c",
    text: "#ffffff",
    accent: "#e0b84f",
    word: "indigo and gold",
  },
  hanukkah: {
    frame: "#1d4e89",
    text: "#ffffff",
    accent: "#9fb3c8",
    word: "royal blue and silver",
  },
  passover: {
    frame: "#6d1a36",
    text: "#ffffff",
    accent: "#c8a165",
    word: "wine and wheat",
  },
  easterSage: {
    frame: "#4d6b53",
    text: "#ffffff",
    accent: "#e4a3b0",
    word: "sage and blush",
  },
  easterLilac: {
    frame: "#5f4785",
    text: "#ffffff",
    accent: "#f2c14e",
    word: "lilac and yellow",
  },
  halloween: {
    frame: "#1c1c1c",
    text: "#ffffff",
    accent: "#e46a1b",
    word: "black and pumpkin orange",
  },
  halloweenPurple: {
    frame: "#3b1f4a",
    text: "#ffffff",
    accent: "#f08a24",
    word: "plum and orange",
  },
  thanks: {
    frame: "#8a3b12",
    text: "#ffffff",
    accent: "#d19a3a",
    word: "rust and harvest gold",
  },
  thanksBrown: {
    frame: "#4a3222",
    text: "#ffffff",
    accent: "#c67b2f",
    word: "walnut and amber",
  },
  valentine: {
    frame: "#b0123a",
    text: "#ffffff",
    accent: "#f4a7b9",
    word: "crimson and pink",
  },
  valentineRose: {
    frame: "#9d174d",
    text: "#ffffff",
    accent: "#f9c6d8",
    word: "rose and blush",
  },
  stPat: {
    frame: "#137a3f",
    text: "#ffffff",
    accent: "#d4a017",
    word: "emerald and gold",
  },
  mother: {
    frame: "#a8455a",
    text: "#ffffff",
    accent: "#f3c6cf",
    word: "dusty rose",
  },
  motherPlum: {
    frame: "#7b3f61",
    text: "#ffffff",
    accent: "#e9b8c9",
    word: "plum and pink",
  },
  father: {
    frame: "#1f3a5f",
    text: "#ffffff",
    accent: "#8f5f2e",
    word: "navy and tan",
  },
  fatherGreen: {
    frame: "#2f4a3a",
    text: "#ffffff",
    accent: "#b88a4e",
    word: "forest green and tan",
  },
  usa: {
    frame: "#1c2f5e",
    text: "#ffffff",
    accent: "#b22234",
    word: "navy and red",
  },
  india: {
    frame: "#0b2a6f",
    text: "#ffffff",
    accent: "#ff9933",
    word: "navy, saffron and green",
  },
  canada: { frame: "#b5102a", text: "#ffffff", accent: "#b5102a", word: "red" },
  mexico: {
    frame: "#006847",
    text: "#ffffff",
    accent: "#ce1126",
    word: "green and red",
  },
  france: {
    frame: "#002395",
    text: "#ffffff",
    accent: "#ed2939",
    word: "blue and red",
  },
  brazil: {
    frame: "#00733a",
    text: "#ffffff",
    accent: "#ffdf00",
    word: "green and yellow",
  },
  indep: {
    frame: "#1f2a44",
    text: "#ffffff",
    accent: "#e0a526",
    word: "navy and gold",
  },
  blackFriday: {
    frame: "#0a0a0a",
    text: "#ffffff",
    accent: "#e11d48",
    word: "black and red",
  },
  blackFridayY: {
    frame: "#0a0a0a",
    text: "#ffffff",
    accent: "#facc15",
    word: "black and yellow",
  },
  cyber: {
    frame: "#1e1b4b",
    text: "#ffffff",
    accent: "#22d3ee",
    word: "indigo and cyan",
  },
  cyberBlue: {
    frame: "#0b1f4d",
    text: "#ffffff",
    accent: "#60a5fa",
    word: "deep blue",
  },
  school: {
    frame: "#1f2937",
    text: "#ffffff",
    accent: "#f2b705",
    word: "slate and school-bus yellow",
  },
  schoolRed: {
    frame: "#7f1d1d",
    text: "#ffffff",
    accent: "#f2b705",
    word: "brick red and yellow",
  },
  summer: {
    frame: "#0e6f78",
    text: "#ffffff",
    accent: "#f2694b",
    word: "sea green and coral",
  },
  summerSun: {
    frame: "#b03a0c",
    text: "#ffffff",
    accent: "#facc15",
    word: "deep orange and sun yellow",
  },
  winter: {
    frame: "#1e4d7b",
    text: "#ffffff",
    accent: "#a9c7e3",
    word: "ice blue",
  },
  winterSlate: {
    frame: "#334155",
    text: "#ffffff",
    accent: "#cbd5e1",
    word: "slate and frost",
  },
  spring: {
    frame: "#3f7d3a",
    text: "#ffffff",
    accent: "#f4a6b8",
    word: "leaf green and blossom pink",
  },
  springLilac: {
    frame: "#56508a",
    text: "#ffffff",
    accent: "#b9e0a5",
    word: "lilac and green",
  },
  autumn: {
    frame: "#9a3412",
    text: "#ffffff",
    accent: "#d97706",
    word: "burnt orange and ochre",
  },
  autumnOlive: {
    frame: "#4d5226",
    text: "#ffffff",
    accent: "#c2702a",
    word: "olive and copper",
  },
};

const LAYOUT = {
  cardSolid: "A solid card with {m} over the code and the label underneath",
  cardBand: "A light card with {m} and a solid label band",
  cardPill: "A light card with {m} and a pill-shaped button under the code",
  tabBottom: "A framed code with a tab hanging below it for the label",
  tabTop: "A folder tab on top carrying the label{mw}",
  ribbon:
    "A card with {m} and a ribbon banner with folded tails across the bottom",
  bubbleTop: "A speech bubble over the code holding the label",
  bubbleFrame: "A speech bubble around the code with {m} and the label inside",
  chatPair:
    "Two chat bubbles: a light one with the note and a solid one with the label",
  ticketV:
    "A ticket with side notches, a perforated line and a stub for the label{mw}",
  ticketH:
    "A wide ticket: the code on the left, a perforated stub with {m} on the right",
  stamp:
    "A postage stamp with a perforated edge, a hairline border and {m} in the corner",
  seal: "A round badge with {m} inside the ring, the label set along its top and the note along its bottom",
  phone: "A phone with the code on its screen{mw}",
  arrowTag: "An arrow-shaped tag pointing up at the code",
  arrowCurl:
    "A light card with a curled arrow pointing from the label to the code",
  corners: "Viewfinder corners around the code, the label underneath",
  rules: "The label between two short rules under the code{mw}",
  underline: "A bold label with a short accent underline",
  doubleLine: "A thin double border with {m}, a small divider and the label",
  polaroid:
    "An instant photo with a strip of tape and the label in its wide bottom margin",
  sticker: "A die-cut sticker with a thick outline and an offset shadow{mw}",
  hangTag: "A hang tag with clipped corners, an eyelet and a loop of string",
  doorHanger: "A door hanger with a round cut-out at the top",
  arch: "An arched card, like a window, with {m}",
  landscape:
    "A wide card: the code on one side, {m} and the label on the other",
  bizCard:
    "A business card: a greeting and a call to save the contact beside the code",
  envelope: "An envelope with a pointed flap over the code{mw}",
  receipt: "A receipt with zigzag edges and dashed separators",
  browser: "A browser window with an address bar over the code",
  calendar: "A calendar page with binder rings and a header band",
  giftBox: "A gift box with a ribbon and a bow on the lid",
  bag: "A shopping bag with handles, the code on its front",
  house: "A house with a roof and chimney around the code{mw}",
  awning: "A shop front under a striped, scalloped awning",
  filmStrip: "A film strip with sprocket holes down both sides",
  lanyard: "An event badge with a clip slot and a header band",
  shield: "A shield with {m} and a banner across the bottom",
  laurel:
    "A light card with a laurel wreath around the note and the label underneath",
  neon: "A dark card with a bright hairline tube around the code{mw}",
  chalkboard: "A chalkboard in a wooden frame",
  circleTop: "A solid card with a round badge holding {m} on its top edge",
  sideBar: "A light card with a bold side bar and left-aligned text{mw}",
  twoBands: "Bands over and under the code: the note on top, the label below",
  bunting: "A string of pennants across the top of a light card",
  burstCorner: "A solid card with a starburst over the corner for the note",
  priceTag: "A price tag with a pointed top and an eyelet",
  coupon: "A coupon with a dashed cut line and a pair of scissors on the edge",
  hangingSign: "A hanging sign on two chains",
  cupShape: "A takeaway cup with a lid and a sleeve carrying the label",
  scene: "Rolling hills under the code and {m} in the sky",
  skyline: "A city skyline along the bottom",
  geoCorners:
    "A light card with a quarter circle and a triangle in opposite corners",
  waveBand: "A wavy band under the code{mw}",
  halfCircle: "A large half circle rising behind the code",
  stitched: "A card with a stitched dashed edge{mw}",
  boardingPass: "A boarding pass with a header band and a perforated stub",
  compact: "The code on a solid tile with the label inside",
  jarLabel:
    "A wide label with curved top and bottom edges, the code beside {m}",
  flagBand: "Flag colors in a band over the code{mw}",
  ...INDUSTRY_LAYOUT_WORDS,
};

const MOTIF_WORDS = {
  holly: "a holly sprig",
  bauble: "a bauble",
  northStar: "a north star",
  star5: "a star",
  starRound: "a rounded star",
  burst: "a starburst",
  tiers: "a tiered tree",
  wreath: "a wreath",
  crystal: "a snow crystal",
  mountain: "snowy peaks",
  mitten: "a mitten",
  candle: "a candle",
  bellPair: "a pair of bells",
  crescent: "a crescent moon",
  crescentStar: "a crescent and star",
  lantern: "a lantern",
  lanternRound: "a round paper lantern",
  diya: "a diya lamp",
  rangoli: "a rangoli flower",
  lotus: "a lotus",
  marigold: "a marigold",
  splash: "a splash of color",
  blossom: "a plum blossom",
  coin: "a lucky coin",
  knot: "a lucky knot",
  menorah: "a menorah",
  hexagram: "a Star of David",
  cup: "a kiddush cup",
  matzah: "matzah",
  egg: "a painted egg",
  tulip: "a tulip",
  daisy: "a daisy",
  butterfly: "a butterfly",
  sprout: "a sprout",
  branch: "a leafy branch",
  cherryBranch: "a blossom branch",
  sun: "a sun",
  waves: "waves",
  parasol: "a beach umbrella",
  popsicle: "an ice pop",
  shell: "a shell",
  maple: "a maple leaf",
  oak: "an oak leaf",
  acorn: "an acorn",
  wheat: "a sheaf of wheat",
  bat: "a bat",
  web: "a spider web",
  hat: "a witch's hat",
  pumpkinTall: "a pumpkin",
  feather: "a feather",
  heart: "a heart",
  heartArrow: "a heart and arrow",
  hearts: "two hearts",
  letter: "a love letter",
  shamrock: "a shamrock",
  clover: "a four-leaf clover",
  horseshoe: "a horseshoe",
  rainbow: "a rainbow",
  firework: "a firework",
  chakra: "a wheel",
  balloon: "a balloon",
  cake: "a birthday cake",
  glasses: "two raised glasses",
  rings: "two rings",
  bow: "a bow",
  mask: "a masquerade mask",
  crown: "a crown",
  gem: "a gem",
  starBadge: "a star badge",
  bolt: "a lightning bolt",
  percent: "a percent sign",
  cursor: "a cursor",
  priceTag: "a price tag",
  cart: "a shopping cart",
  box: "a parcel",
  leafEco: "a leaf",
  recycle: "recycling arrows",
  hanger: "a clothes hanger",
  shirt: "a T-shirt",
  wallet: "a wallet",
  coins: "a stack of coins",
  bank: "a bank",
  receipt: "a receipt",
  tap: "a contactless symbol",
  cutlery: "a fork and knife",
  cloche: "a serving dome",
  chefHat: "a chef's hat",
  wineGlass: "a wine glass",
  martini: "a cocktail glass",
  mug: "a beer mug",
  bottle: "a bottle",
  bean: "a coffee bean",
  steam: "a steaming cup",
  pizza: "a pizza slice",
  iceCream: "an ice cream cone",
  bowl: "a bowl and chopsticks",
  key: "a key",
  bed: "a bed",
  suitcase: "a suitcase",
  plane: "a plane",
  compass: "a compass",
  houseRoof: "a house",
  building: "an apartment building",
  door: "a front door",
  palm: "a palm tree",
  ticket: "a ticket",
  camera: "a camera",
  music: "music notes",
  mic: "a microphone",
  film: "a film strip",
  megaphone: "a megaphone",
  globe: "a globe",
  plus: "a medical cross",
  pill: "a capsule",
  pulse: "a heartbeat line",
  tooth: "a tooth",
  mortarboard: "a graduation cap",
  book: "an open book",
  pencil: "a pencil",
  ruler: "a ruler",
  flask: "a lab flask",
  palette: "a paint palette",
  dumbbell: "a dumbbell",
  kettlebell: "a kettlebell",
  trophy: "a trophy",
  medal: "a medal",
  stopwatch: "a stopwatch",
  paw: "a paw print",
  scissors: "scissors",
  gear: "a gear",
  lightbulb: "a light bulb",
  hourglass: "an hourglass",
  phoneScan: "a phone scanning a code",
  corners: "scan corners",
  play: "a play button",
  link: "a chain link",
  hashtag: "a hashtag",
  mail: "an envelope",
  quote: "quotation marks",
  thumb: "a thumbs-up",
  arrowDown: "a down arrow",
  arrowRight: "an arrow",
  chevronDown: "a chevron",
  curlArrow: "a curled arrow",
  download: "a download arrow",
  phone: "a phone",
  card: "a payment card",
  bubble: "a speech bubble",
  speaker: "a speaker",
  calendarPage: "a calendar",
  bag: "a shopping bag",
  tie: "a necktie",
  bowtie: "a bow tie",
  "icon:wifi": "a Wi-Fi symbol",
  "icon:star": "a star",
  "icon:heart": "a heart",
  "icon:phone": "a phone",
  "icon:headphones": "headphones",
  "icon:calendar": "a calendar",
  "icon:user": "a person",
  "icon:chat": "a chat bubble",
  "icon:bag": "a shopping bag",
  "icon:bell": "a bell",
  "icon:cup": "a cup",
  "icon:card": "a payment card",
  "icon:check": "a check mark",
  "icon:info": "an info sign",
  "icon:home": "a house",
  "icon:pin": "a map pin",
  "icon:share": "a share symbol",
  "icon:download": "a download arrow",
  "icon:clock": "a clock",
  "icon:snowflake": "a snowflake",
  "icon:pumpkin": "a pumpkin",
  "icon:tree": "a fir tree",
  "icon:sparkle": "a sparkle",
  "icon:gift": "a gift",
  ...INDUSTRY_MOTIF_WORDS,
};

/** Phrases for layouts whose {m} slot is empty (no motif). */
const LAYOUT_PLAIN = {
  cardSolid:
    "A solid card with the note over the code and the label underneath",
  cardBand: "A light card with a hairline border and a solid label band",
  cardPill: "A light card with a pill-shaped button under the code",
  ribbon: "A card with a ribbon banner with folded tails across the bottom",
  bubbleFrame: "A speech bubble around the code with the label inside",
  ticketH:
    "A wide ticket: the code on the left, a perforated stub on the right",
  stamp: "A postage stamp with a perforated edge and a hairline border",
  seal: "A round badge with the label set along the top of its ring and the note along the bottom",
  arch: "An arched card, like a window",
  landscape: "A wide card: the code on one side, the label on the other",
  doubleLine: "A thin double border with a small divider and the label",
  shield: "A shield with a banner across the bottom",
  jarLabel: "A wide label with curved top and bottom edges",
  ...INDUSTRY_LAYOUT_PLAIN,
};

/** Motifs a layout draws when the entry names none. */
const LAYOUT_DEFAULT_MOTIF = { circleTop: "star5", scene: "sun" };

function describe(layout, o, pal) {
  const name = o.m ?? LAYOUT_DEFAULT_MOTIF[layout];
  const m = name ? MOTIF_WORDS[name] : null;
  if (name && !m) throw new Error(`No words for motif ${name}`);
  const phrase =
    m || !LAYOUT[layout]?.includes("{m}")
      ? LAYOUT[layout]
      : LAYOUT_PLAIN[layout];
  if (!phrase)
    throw new Error(`No phrase for ${layout}${m ? "" : " without a motif"}`);
  let text = phrase.replace("{mw}", m ? ` and ${m}` : "").replace("{m}", m);
  if (pal?.word) text += `, in ${pal.word}`;
  return `${text}.`;
}

export const ENTRIES = [];
let current = {
  collection: "call-to-action",
  occasion: undefined,
  tags: [],
  ct: [],
};
const section = (collection, occasion, tags = [], ct = []) => {
  current = { collection, occasion, tags, ct };
};

/**
 * f(id, name, layout, cta, note, options, palette, extraTags, contentTypes)
 * note: undefined for none
 */
function f(id, name, layout, cta, note, options, palette, extraTags, ct) {
  const o = options ?? {};
  const pal = palette ?? MONO;
  const colors = { frame: pal.frame, text: pal.text, accent: pal.accent };
  ENTRIES.push({
    id,
    name,
    layout,
    cta,
    note,
    o,
    colors,
    collection: current.collection,
    occasion: current.occasion,
    tags: [...new Set([...current.tags, ...(extraTags ?? [])])],
    contentTypes: ct ?? current.ct,
    description: describe(layout, o, pal),
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Call to action
// ════════════════════════════════════════════════════════════════════════════
section("call-to-action", undefined, ["call to action"]);
f("scan-me-tile", "Scan me tile", "compact", "Scan me");
f(
  "scan-me-card",
  "Scan me card",
  "cardSolid",
  "Scan me",
  "Point your camera here",
  {},
  MONO,
  ["minimal"]
);
f(
  "learn-more-card",
  "Learn more card",
  "cardSolid",
  "Scan to learn more",
  undefined,
  { m: "icon:info" },
  MONO,
  ["information"]
);
f("scan-me-band", "Label band", "cardBand", "Scan me", undefined, {}, MONO, [
  "minimal",
]);
f(
  "scan-me-band-top",
  "Top band",
  "cardBand",
  "Scan me",
  "Open with your camera",
  { bandTop: true },
  MONO
);
f(
  "tap-or-scan-band",
  "Tap or scan band",
  "cardBand",
  "Tap or scan",
  "No app needed",
  { m: "tap" },
  MONO,
  ["nfc"]
);
f(
  "scan-button",
  "Button",
  "cardPill",
  "Scan me",
  "Point your camera here",
  {},
  MONO,
  ["button"]
);
f(
  "scan-button-tinted",
  "Tinted button",
  "cardPill",
  "Scan to start",
  undefined,
  { tintBg: true, m: "arrowDown" },
  MONO,
  ["button"]
);
f("hanging-tab", "Hanging tab", "tabBottom", "Scan me", undefined, {}, MONO, [
  "tab",
]);
f(
  "hanging-tab-two-lines",
  "Tab with note",
  "tabBottom",
  "Scan for details",
  "Takes a few seconds",
  { wide: true },
  MONO,
  ["tab"]
);
f(
  "folder-tab",
  "Folder tab",
  "tabTop",
  "Scan me",
  "Point your camera here",
  {},
  MONO,
  ["tab"]
);
f(
  "folder-tab-arrow",
  "Folder tab with arrow",
  "tabTop",
  "Scan here",
  undefined,
  { m: "arrowDown" },
  MONO,
  ["tab"]
);
f("ribbon-banner", "Ribbon banner", "ribbon", "Scan me", undefined, {}, MONO, [
  "ribbon",
]);
f(
  "ribbon-banner-solid",
  "Solid ribbon",
  "ribbon",
  "Scan to see more",
  "Open with your camera",
  { solid: true },
  MONO,
  ["ribbon"]
);
f(
  "ribbon-sparkle",
  "Ribbon with sparkle",
  "ribbon",
  "See what's new",
  "Scan to find out",
  { m: "icon:sparkle" },
  MONO,
  ["ribbon", "launch"]
);
f(
  "speech-bubble-over",
  "Bubble over code",
  "bubbleTop",
  "Scan me!",
  undefined,
  {},
  MONO,
  ["speech bubble"]
);
f(
  "speech-bubble-round",
  "Round bubble",
  "bubbleTop",
  "Hey, scan me",
  "It only takes a second",
  { round: true, tailX: 900, tailSkew: 40 },
  MONO,
  ["speech bubble"]
);
f(
  "bubble-tail-left",
  "Bubble, tail left",
  "bubbleFrame",
  "Scan me",
  undefined,
  { tail: "left" },
  MONO,
  ["speech bubble"]
);
f(
  "bubble-tail-right",
  "Bubble, tail right",
  "bubbleFrame",
  "Scan to say hello",
  "Say hello anytime",
  { tail: "right", m: "icon:chat" },
  MONO,
  ["speech bubble"]
);
f(
  "bubble-outline",
  "Outline bubble",
  "bubbleFrame",
  "Scan me",
  "Point your camera here",
  { tail: "center", light: true },
  MONO,
  ["speech bubble", "light"]
);
f(
  "chat-pair",
  "Chat pair",
  "chatPair",
  "Scan to chat",
  "Questions? Ask us",
  {},
  MONO,
  ["chat", "messaging"]
);
f(
  "ticket-stub",
  "Ticket stub",
  "ticketV",
  "Scan me",
  "Keep this ticket",
  {},
  MONO,
  ["ticket"]
);
f(
  "ticket-light",
  "Light ticket",
  "ticketV",
  "Scan for details",
  undefined,
  { light: true },
  MONO,
  ["ticket", "light"]
);
f(
  "ticket-wide",
  "Wide ticket",
  "ticketH",
  "Scan me",
  "Admit one",
  { m: "ticket" },
  MONO,
  ["ticket"]
);
f(
  "postage-stamp",
  "Postage stamp",
  "stamp",
  "Scan me",
  "Special delivery",
  { m: "mail" },
  MONO,
  ["stamp"]
);
f(
  "postage-stamp-light",
  "Light stamp",
  "stamp",
  "Scan to open",
  "First class",
  { light: true, m: "star5" },
  MONO,
  ["stamp", "light"]
);
f(
  "round-badge",
  "Round badge",
  "seal",
  "Scan me",
  "Open with your camera",
  { m: "phoneScan" },
  MONO,
  ["badge", "round"]
);
f(
  "round-badge-light",
  "Light round badge",
  "seal",
  "Point and scan",
  "No app needed",
  { light: true, m: "corners" },
  MONO,
  ["badge", "round", "light"]
);
f(
  "rosette-badge",
  "Rosette",
  "seal",
  "Scan to find out",
  "See inside",
  { edge: "rosette", m: "starRound" },
  MONO,
  ["badge", "seal"]
);
f(
  "scalloped-badge",
  "Scalloped badge",
  "seal",
  "Scan me",
  "Takes two seconds",
  { edge: "scallop", light: true, m: "chevronDown" },
  MONO,
  ["badge", "seal"]
);
f(
  "phone-screen",
  "Phone screen",
  "phone",
  "Scan me",
  "Open your camera",
  {},
  MONO,
  ["phone", "mockup"]
);
f(
  "phone-outline",
  "Phone outline",
  "phone",
  "Scan to open",
  undefined,
  { light: true, m: "phoneScan" },
  MONO,
  ["phone", "mockup", "light"]
);
f(
  "phone-button",
  "Phone with button",
  "phone",
  "Open link",
  "Scan with your camera",
  { button: true },
  MONO,
  ["phone", "mockup", "button"]
);
f(
  "arrow-tag",
  "Arrow tag",
  "arrowTag",
  "Scan here",
  "Point your camera here",
  {},
  MONO,
  ["arrow"]
);
f(
  "curl-arrow",
  "Curled arrow",
  "arrowCurl",
  "Scan me!",
  "Point your camera here",
  {},
  MONO,
  ["arrow"]
);
f(
  "curl-arrow-tinted",
  "Curled arrow, tinted",
  "arrowCurl",
  "Try it",
  "Point, scan, done",
  { tintBg: true },
  SOFT,
  ["arrow"]
);
f("viewfinder", "Viewfinder", "corners", "Scan me", undefined, {}, MONO, [
  "minimal",
  "viewfinder",
]);
f(
  "viewfinder-note",
  "Viewfinder with note",
  "corners",
  "Point your camera here",
  "Scan to open",
  { tintBg: true },
  MONO,
  ["minimal", "viewfinder"]
);
f("side-rules", "Side rules", "rules", "Scan me", undefined, {}, MONO, [
  "minimal",
]);
f(
  "side-rules-border",
  "Bordered rules",
  "rules",
  "Scan to visit",
  "Our website",
  { border: true, m: "globe" },
  MONO,
  ["minimal", "website"]
);
f(
  "underline-bold",
  "Bold underline",
  "underline",
  "Scan me",
  "Point your camera here",
  {},
  SOFT,
  ["minimal"]
);
f(
  "underline-left",
  "Left underline",
  "underline",
  "Scan to read more",
  undefined,
  { left: true, border: true },
  SOFT,
  ["minimal"]
);
f(
  "double-border",
  "Double border",
  "doubleLine",
  "Scan me",
  "Welcome",
  {},
  MONO,
  ["elegant"]
);
f(
  "polaroid-photo",
  "Instant photo",
  "polaroid",
  "Scan me",
  undefined,
  {},
  SOFT,
  ["photo"]
);
f(
  "polaroid-caption",
  "Photo caption",
  "polaroid",
  "See the photos",
  undefined,
  { regular: true, tintBg: true },
  GREY,
  ["photo"]
);
f(
  "sticker-outline",
  "Sticker",
  "sticker",
  "Scan me!",
  "It's quick",
  { inner: "background" },
  MONO,
  ["sticker"]
);
f(
  "sticker-peel",
  "Peeling sticker",
  "sticker",
  "Peel, stick, scan",
  undefined,
  { inner: "background", peel: true, m: "icon:sparkle" },
  MONO,
  ["sticker"]
);
f(
  "sticker-grey",
  "Grey sticker",
  "sticker",
  "Scan here",
  "Point your camera",
  { inner: { mix: ["frame", "background"], amount: 0.85 } },
  GREY,
  ["sticker"]
);
f("hang-tag", "Hang tag", "hangTag", "Scan me", undefined, {}, SOFT, ["tag"]);
f(
  "hang-tag-light",
  "Light hang tag",
  "hangTag",
  "Scan for details",
  undefined,
  { light: true },
  MONO,
  ["tag", "light"]
);
f(
  "side-bar",
  "Side bar",
  "sideBar",
  "Scan to learn more",
  "Point your camera here",
  {},
  SOFT,
  ["editorial"]
);
f(
  "side-bar-arrow",
  "Side bar with arrow",
  "sideBar",
  "Scan me",
  "See more online",
  { m: "arrowRight", tintBg: true },
  MONO,
  ["editorial"]
);
f(
  "two-bands",
  "Two bands",
  "twoBands",
  "Scan me",
  "Hello there",
  { noteInk: "frame" },
  SOFT,
  ["bands"]
);
f(
  "stitched-card",
  "Stitched card",
  "stitched",
  "Scan me",
  "Point your camera here",
  {},
  MONO,
  ["stitched"]
);
f(
  "stitched-light",
  "Light stitched card",
  "stitched",
  "Scan to open",
  undefined,
  { light: true, m: "chevronDown" },
  MONO,
  ["stitched", "light"]
);
f(
  "geo-corners",
  "Geometric corners",
  "geoCorners",
  "Scan me",
  "Take a look",
  {},
  SOFT,
  ["modern"]
);
f(
  "circle-badge-top",
  "Badge on top",
  "circleTop",
  "Scan me",
  "Point your camera here",
  { m: "corners" },
  MONO,
  ["badge"]
);
f(
  "browser-window",
  "Browser window",
  "browser",
  "Visit our website",
  "Scan to open",
  {},
  MONO,
  ["website", "link"]
);
f(
  "landscape-panel",
  "Wide panel",
  "landscape",
  "Scan me",
  "Point your camera here",
  {},
  MONO,
  ["landscape", "wide"]
);
f(
  "landscape-light",
  "Wide light panel",
  "landscape",
  "Scan to learn more",
  "Details online",
  { light: true, codeRight: true, m: "icon:info", bar: true },
  MONO,
  ["landscape", "wide", "light"]
);
f("neon-tube", "Neon tube", "neon", "Scan me", undefined, {}, NEON, [
  "dark",
  "neon",
]);
f("half-circle", "Half circle", "halfCircle", "Scan me", undefined, {}, SOFT, [
  "modern",
]);
f(
  "wave-band",
  "Wave band",
  "waveBand",
  "Scan me",
  "Point your camera here",
  {},
  MONO,
  ["modern"]
);
f(
  "scan-to-watch",
  "Watch video",
  "cardSolid",
  "Scan to watch",
  "Video",
  { m: "play" },
  MONO,
  ["video"]
);
f(
  "scan-to-listen",
  "Listen",
  "cardBand",
  "Scan to listen",
  "Audio",
  { m: "speaker" },
  MONO,
  ["audio", "podcast"]
);
f(
  "scan-for-directions",
  "Directions",
  "cardPill",
  "Get directions",
  "Find us",
  { m: "icon:pin" },
  MONO,
  ["directions", "map"],
  ["location", "url"]
);
f(
  "scan-to-call",
  "Call us",
  "tabTop",
  "Scan to call",
  "We're happy to help",
  { m: "icon:phone" },
  MONO,
  ["phone", "contact"],
  ["phone"]
);
f(
  "scan-to-email",
  "Email us",
  "stamp",
  "Scan to email",
  "Write to us",
  { m: "mail", light: true },
  MONO,
  ["email", "contact"],
  ["email"]
);
f(
  "scan-to-share",
  "Share",
  "bubbleFrame",
  "Scan to share",
  "Pass it on",
  { m: "icon:share", tail: "right", light: true },
  MONO,
  ["share"]
);
f(
  "scan-to-subscribe",
  "Subscribe",
  "circleTop",
  "Scan to subscribe",
  "Never miss an update",
  { m: "icon:bell" },
  MONO,
  ["newsletter", "updates"]
);
f(
  "scan-for-schedule",
  "Opening hours",
  "cardBand",
  "See our hours",
  undefined,
  { m: "icon:clock", bandTop: true },
  MONO,
  ["hours", "schedule"]
);
f(
  "scan-to-sign-up",
  "Sign up",
  "arrowTag",
  "Scan to sign up",
  "It's free",
  {},
  MONO,
  ["sign up", "registration"]
);
f(
  "scan-to-download-file",
  "Download file",
  "cardSolid",
  "Scan to download",
  "Free",
  { m: "download" },
  MONO,
  ["download", "file"],
  ["pdf", "url"]
);
f(
  "scan-for-link",
  "Link",
  "chatPair",
  "Scan for the link",
  "Looking for this?",
  { m: "link" },
  MONO,
  ["link"]
);
f(
  "scan-to-vote",
  "Vote",
  "ticketV",
  "Scan to vote",
  "One vote per person",
  { m: "icon:check" },
  MONO,
  ["vote", "poll"]
);

// ════════════════════════════════════════════════════════════════════════════
// Holidays
// ════════════════════════════════════════════════════════════════════════════
section("holidays", "christmas", ["christmas", "holidays", "december"]);
f(
  "christmas-holly",
  "Holly card",
  "cardBand",
  "Scan me",
  "Merry Christmas",
  { m: "holly" },
  P.xmasRed,
  ["holly"]
);
f(
  "christmas-tree",
  "Christmas tree",
  "cardSolid",
  "Scan for our hours",
  "Merry Christmas",
  { m: "tiers", mfill: "text", mfill2: "accent" },
  P.xmasPine,
  ["tree"]
);
f(
  "christmas-bauble",
  "Bauble arch",
  "arch",
  "Scan me",
  undefined,
  { m: "bauble" },
  P.xmasRed,
  ["bauble"]
);
f(
  "christmas-star-seal",
  "Star of the season",
  "seal",
  "Season's greetings",
  "Scan me",
  { edge: "rosette", m: "northStar" },
  P.xmasNight,
  ["star"]
);
f(
  "christmas-wreath",
  "Wreath badge",
  "circleTop",
  "Scan to order",
  "Holiday menu",
  { m: "wreath" },
  P.xmasPine,
  ["wreath", "menu"]
);
f(
  "christmas-bells",
  "Christmas bells",
  "ribbon",
  "Merry Christmas",
  "Scan to see our gifts",
  { m: "bellPair", solid: true, fill: "text" },
  P.xmasRed,
  ["bells"]
);
f(
  "christmas-gift-box",
  "Gift box",
  "giftBox",
  "Scan to open",
  undefined,
  {},
  P.xmasRed,
  ["gift"]
);
f(
  "christmas-candle",
  "Candlelight",
  "doubleLine",
  "Scan for the service",
  "Christmas Eve",
  { m: "candle" },
  P.xmasNight,
  ["candle", "church"]
);
f(
  "christmas-snow-tab",
  "Snowy tab",
  "tabBottom",
  "Merry Christmas",
  "Scan me",
  {},
  P.xmasPine,
  ["snow"]
);
f(
  "christmas-market-ticket",
  "Market ticket",
  "ticketV",
  "Christmas market",
  "Scan for the map",
  { m: "northStar" },
  P.xmasRed,
  ["market"]
);
f(
  "christmas-postcard",
  "Christmas post",
  "stamp",
  "Season's greetings",
  "Scan me",
  { m: "icon:tree", light: true },
  P.xmasPine,
  ["card", "post"]
);

section("holidays", "new-year", ["new year", "celebration", "party"]);
f(
  "new-year-firework",
  "Fireworks",
  "cardSolid",
  "Happy New Year",
  "Scan me",
  { m: "firework", mfill: "accent", mfill2: "text" },
  P.nyGold,
  ["fireworks"]
);
f(
  "new-year-toast",
  "Midnight toast",
  "arch",
  "Cheers to the new year",
  undefined,
  { m: "glasses", solid: true },
  P.nyNavy,
  ["toast"]
);
f(
  "new-year-skyline",
  "City countdown",
  "skyline",
  "Happy New Year",
  "Scan for the party",
  { dark: true },
  P.nyNavy,
  ["city", "countdown"]
);
f(
  "new-year-seal",
  "New Year seal",
  "seal",
  "Happy New Year",
  "Scan me",
  { edge: "scallop", m: "icon:sparkle" },
  P.nyGold,
  ["badge"]
);
f(
  "new-year-calendar",
  "First page",
  "calendar",
  "Scan for our plans",
  "Happy New Year",
  {},
  P.nyGold,
  ["calendar"]
);
f(
  "new-year-countdown",
  "Countdown",
  "twoBands",
  "Scan to RSVP",
  "New Year's Eve",
  { noteInk: "frame" },
  P.nyGold,
  ["countdown", "rsvp"]
);
f(
  "new-year-sparkle",
  "Sparkle sticker",
  "sticker",
  "Happy New Year",
  undefined,
  { m: "icon:sparkle", inner: "background" },
  P.nyNavy,
  ["sparkle"]
);

section("holidays", "lunar-new-year", [
  "lunar new year",
  "chinese new year",
  "spring festival",
]);
f(
  "lunar-lantern",
  "Red lantern",
  "cardBand",
  "Scan me",
  "Happy Lunar New Year",
  { m: "lanternRound" },
  P.lunarRed,
  ["lantern"]
);
f(
  "lunar-coin",
  "Lucky coin",
  "seal",
  "Happy Lunar New Year",
  "Scan me",
  { edge: "rosette", m: "coin" },
  P.lunarDeep,
  ["coin", "luck"]
);
f(
  "lunar-knot",
  "Lucky knot",
  "cardSolid",
  "Scan for good luck",
  "Happy New Year",
  { m: "knot", mfill: "accent", mfill2: "text" },
  P.lunarRed,
  ["knot", "luck"]
);
f(
  "lunar-blossom",
  "Plum blossom",
  "arch",
  "Happy Lunar New Year",
  undefined,
  { m: "blossom" },
  P.lunarDeep,
  ["blossom"]
);
f(
  "lunar-red-envelope",
  "Red envelope",
  "envelope",
  "Scan to open",
  undefined,
  { m: "coin" },
  P.lunarRed,
  ["red envelope", "gift"]
);
f(
  "lunar-banner",
  "Festival banner",
  "twoBands",
  "Scan for the menu",
  "Spring Festival",
  { noteInk: { mix: ["frame", "#000000"], amount: 0.55 } },
  P.lunarRed,
  ["menu"]
);

section("holidays", "diwali", ["diwali", "deepavali", "festival of lights"]);
f(
  "diwali-diya",
  "Diya",
  "cardSolid",
  "Happy Diwali",
  "Scan me",
  { m: "diya", mfill: "text", mfill2: "accent" },
  P.diwali,
  ["diya", "lamp"]
);
f(
  "diwali-rangoli",
  "Rangoli seal",
  "seal",
  "Happy Diwali",
  "Scan for our offers",
  { edge: "scallop", m: "rangoli" },
  P.diwali,
  ["rangoli"]
);
f(
  "diwali-marigold",
  "Marigold arch",
  "arch",
  "Shubh Deepavali",
  undefined,
  { m: "marigold" },
  P.diwaliSaffron,
  ["marigold", "flowers"]
);
f(
  "diwali-lotus",
  "Lotus border",
  "doubleLine",
  "Scan for our greetings",
  "Happy Diwali",
  { m: "lotus" },
  P.diwali,
  ["lotus"]
);
f(
  "diwali-toran",
  "Toran",
  "bunting",
  "Happy Diwali",
  undefined,
  {},
  P.diwaliSaffron,
  ["toran", "decoration"]
);
f(
  "diwali-lantern",
  "Sky lantern",
  "cardBand",
  "Scan for the sale",
  "Diwali offers",
  { m: "lantern", bandTop: true },
  P.diwali,
  ["lantern", "sale"]
);
f(
  "diwali-rangoli-card",
  "Rangoli card",
  "circleTop",
  "Scan me",
  "Happy Diwali",
  { m: "rangoli" },
  P.diwaliSaffron,
  ["rangoli"]
);

section("holidays", "holi", ["holi", "festival of colors", "spring"]);
f(
  "holi-splash",
  "Color splash",
  "cardPill",
  "Happy Holi",
  "Scan me",
  { m: "splash" },
  P.holiPink,
  ["colors"]
);
f(
  "holi-corners",
  "Holi corners",
  "geoCorners",
  "Scan me",
  "Happy Holi",
  {},
  P.holiViolet,
  ["colors"]
);
f(
  "holi-sticker",
  "Holi sticker",
  "sticker",
  "Happy Holi",
  undefined,
  { m: "splash", inner: "background", mfill: "frame" },
  P.holiViolet,
  ["colors"]
);
f(
  "holi-bands",
  "Holi bands",
  "twoBands",
  "Scan for the party",
  "Happy Holi",
  {},
  P.holiPink,
  ["party"]
);
f(
  "holi-bunting",
  "Holi bunting",
  "bunting",
  "Scan me",
  undefined,
  {},
  P.holiViolet,
  ["decoration"]
);

section("holidays", "ramadan", ["ramadan", "iftar", "ramadan kareem"]);
f(
  "ramadan-lantern",
  "Ramadan lantern",
  "arch",
  "Ramadan Kareem",
  undefined,
  { m: "lantern", solid: true },
  P.ramadan,
  ["lantern"]
);
f(
  "ramadan-crescent",
  "Crescent and star",
  "cardSolid",
  "Ramadan Kareem",
  "Scan for iftar times",
  { m: "crescentStar", mfill: "accent", mfill2: "text" },
  P.ramadan,
  ["crescent", "iftar"]
);
f(
  "ramadan-seal",
  "Ramadan seal",
  "seal",
  "Ramadan Mubarak",
  "Scan me",
  { edge: "rosette", m: "crescentStar" },
  P.ramadan,
  ["badge"]
);
f(
  "ramadan-iftar-menu",
  "Iftar menu",
  "cardBand",
  "Scan for the iftar menu",
  undefined,
  { m: "crescent", bandTop: true },
  P.eidNight,
  ["menu", "restaurant"]
);
f(
  "ramadan-hanging",
  "Hanging sign",
  "hangingSign",
  "Ramadan Kareem",
  undefined,
  {},
  P.ramadan,
  ["sign"]
);

section("holidays", "eid-al-fitr", ["eid al-fitr", "eid", "eid mubarak"]);
f(
  "eid-fitr-arch",
  "Eid arch",
  "arch",
  "Eid Mubarak",
  undefined,
  { m: "crescentStar", solid: true },
  P.eidEmerald,
  ["crescent"]
);
f(
  "eid-fitr-lantern",
  "Eid lantern",
  "cardBand",
  "Scan me",
  "Eid Mubarak",
  { m: "lantern" },
  P.eidEmerald,
  ["lantern"]
);
f(
  "eid-fitr-seal",
  "Eid seal",
  "seal",
  "Eid Mubarak",
  "Scan for our greetings",
  { edge: "scallop", m: "lantern" },
  P.eidEmerald,
  ["badge"]
);
f(
  "eid-fitr-border",
  "Eid border",
  "doubleLine",
  "Scan me",
  "Eid Mubarak",
  { m: "crescent" },
  P.eidNight,
  ["elegant"]
);
f(
  "eid-fitr-gift",
  "Eid gift",
  "giftBox",
  "Eid Mubarak",
  undefined,
  {},
  P.eidEmerald,
  ["gift"]
);

section("holidays", "eid-al-adha", ["eid al-adha", "eid", "eid mubarak"]);
f(
  "eid-adha-night",
  "Night crescent",
  "cardSolid",
  "Eid al-Adha Mubarak",
  "Scan me",
  { m: "crescent", mfill: "accent" },
  P.eidNight,
  ["crescent"]
);
f(
  "eid-adha-seal",
  "Eid al-Adha seal",
  "seal",
  "Eid al-Adha Mubarak",
  "Scan me",
  { m: "crescent" },
  P.eidNight,
  ["badge"]
);
f(
  "eid-adha-lantern",
  "Lantern tab",
  "tabBottom",
  "Eid Mubarak",
  "Scan for our greetings",
  {},
  P.eidEmerald,
  ["tab"]
);
f(
  "eid-adha-envelope",
  "Eid envelope",
  "envelope",
  "Scan to open",
  undefined,
  { m: "crescentStar" },
  P.eidEmerald,
  ["card"]
);

section("holidays", "hanukkah", ["hanukkah", "chanukah", "festival of lights"]);
f(
  "hanukkah-menorah",
  "Menorah",
  "cardBand",
  "Happy Hanukkah",
  "Scan me",
  { m: "menorah" },
  P.hanukkah,
  ["menorah"]
);
f(
  "hanukkah-star",
  "Star of David",
  "seal",
  "Happy Hanukkah",
  "Scan me",
  { edge: "rosette", m: "hexagram" },
  P.hanukkah,
  ["star"]
);
f(
  "hanukkah-candles",
  "Hanukkah lights",
  "cardSolid",
  "Chag Sameach",
  "Scan for the schedule",
  { m: "menorah", mfill: "text", mfill2: "accent" },
  P.hanukkah,
  ["candles"]
);
f(
  "hanukkah-border",
  "Hanukkah border",
  "doubleLine",
  "Scan me",
  "Happy Hanukkah",
  { m: "hexagram" },
  P.hanukkah,
  ["elegant"]
);
f(
  "hanukkah-gift",
  "Hanukkah gift",
  "giftBox",
  "Scan to open",
  undefined,
  {},
  P.hanukkah,
  ["gift"]
);

section("holidays", "passover", ["passover", "pesach", "seder"]);
f(
  "passover-cup",
  "Kiddush cup",
  "cardSolid",
  "Chag Pesach Sameach",
  "Scan for the Haggadah",
  { m: "cup", mfill: "text", mfill2: "accent" },
  P.passover,
  ["seder"]
);
f(
  "passover-matzah",
  "Matzah",
  "cardBand",
  "Scan for the seder",
  "Happy Passover",
  { m: "matzah" },
  P.passover,
  ["matzah"]
);
f(
  "passover-border",
  "Seder border",
  "doubleLine",
  "Scan for the seder plan",
  "Happy Passover",
  { m: "cup" },
  P.passover,
  ["elegant"]
);
f(
  "passover-arch",
  "Passover arch",
  "arch",
  "Happy Passover",
  undefined,
  { m: "wheat", solid: true, fill: "accent" },
  P.passover,
  ["spring"]
);

section("holidays", "easter", ["easter", "spring"]);
f(
  "easter-egg",
  "Easter egg",
  "arch",
  "Happy Easter",
  undefined,
  { m: "egg" },
  P.easterSage,
  ["egg"]
);
f(
  "easter-tulip",
  "Easter tulip",
  "cardBand",
  "Scan for the egg hunt",
  "Happy Easter",
  { m: "tulip" },
  P.easterLilac,
  ["egg hunt", "flowers"]
);
f(
  "easter-corners",
  "Easter corners",
  "geoCorners",
  "Scan me",
  "Happy Easter",
  {},
  P.easterSage,
  ["modern"]
);
f(
  "easter-butterfly",
  "Easter butterfly",
  "sticker",
  "Happy Easter",
  undefined,
  { m: "butterfly", inner: "background", mfill: "frame" },
  P.easterLilac,
  ["butterfly"]
);
f(
  "easter-bunting",
  "Easter bunting",
  "bunting",
  "Scan for our Easter menu",
  undefined,
  {},
  P.easterSage,
  ["menu"]
);
f(
  "easter-egg-hunt",
  "Egg hunt ticket",
  "ticketV",
  "Egg hunt",
  "Scan for the map",
  { m: "egg", light: true },
  P.easterLilac,
  ["egg hunt"]
);

section("holidays", "halloween", ["halloween", "october", "spooky"]);
f(
  "halloween-bat",
  "Bat card",
  "cardSolid",
  "Scan if you dare",
  "Happy Halloween",
  { m: "bat", mfill: "accent" },
  P.halloween,
  ["bat"]
);
f(
  "halloween-pumpkin",
  "Pumpkin band",
  "cardBand",
  "Trick or treat",
  undefined,
  { m: "pumpkinTall" },
  P.halloween,
  ["pumpkin"]
);
f(
  "halloween-web",
  "Spider web",
  "cardSolid",
  "Scan me",
  "Happy Halloween",
  { m: "web", mfill: "accent" },
  P.halloweenPurple,
  ["spider web"]
);
f(
  "halloween-hat",
  "Witch's hat",
  "ticketV",
  "Halloween party",
  "Scan to RSVP",
  { m: "hat" },
  P.halloweenPurple,
  ["party"]
);
f(
  "halloween-moon",
  "Halloween moon",
  "scene",
  "Scan if you dare",
  "Happy Halloween",
  {
    m: "crescent",
    sky: "frame",
    skyInk: "text",
    hill1: { mix: ["accent", "frame"], amount: 0.35 },
    mfill: "accent",
    mx: 260,
  },
  P.halloween,
  ["moon"]
);
f(
  "halloween-candle",
  "Candlelit",
  "arch",
  "Happy Halloween",
  undefined,
  { m: "candle", solid: true, fill: "text" },
  P.halloweenPurple,
  ["candle"]
);
f(
  "halloween-seal",
  "Spooky seal",
  "seal",
  "Happy Halloween",
  "Scan me",
  { edge: "scallop", m: "bat" },
  P.halloween,
  ["badge"]
);

section("holidays", "thanksgiving", ["thanksgiving", "harvest", "november"]);
f(
  "thanksgiving-leaf",
  "Maple leaf",
  "cardBand",
  "Happy Thanksgiving",
  "Scan me",
  { m: "maple" },
  P.thanks,
  ["leaves"]
);
f(
  "thanksgiving-wheat",
  "Harvest wheat",
  "doubleLine",
  "Scan for the menu",
  "Happy Thanksgiving",
  { m: "wheat" },
  P.thanksBrown,
  ["menu", "harvest"]
);
f(
  "thanksgiving-acorn",
  "Acorn arch",
  "arch",
  "Give thanks",
  undefined,
  { m: "acorn" },
  P.thanks,
  ["acorn"]
);
f(
  "thanksgiving-pumpkin",
  "Harvest pumpkin",
  "cardSolid",
  "Happy Thanksgiving",
  "Scan for our hours",
  { m: "pumpkinTall", mfill: "accent", mfill2: "text" },
  P.thanksBrown,
  ["pumpkin"]
);
f(
  "thanksgiving-table",
  "Table card",
  "circleTop",
  "Scan for the menu",
  "Thanksgiving dinner",
  { m: "feather" },
  P.thanks,
  ["dinner", "menu"]
);

section("holidays", "valentines-day", ["valentine's day", "love", "february"]);
f(
  "valentine-heart",
  "Heart card",
  "cardSolid",
  "Be my valentine",
  "Scan me",
  { m: "heart", mfill: "accent" },
  P.valentine,
  ["heart"]
);
f(
  "valentine-arrow",
  "Cupid's arrow",
  "arch",
  "Happy Valentine's Day",
  undefined,
  { m: "heartArrow" },
  P.valentineRose,
  ["heart"]
);
f(
  "valentine-hearts",
  "Two hearts",
  "sticker",
  "Scan me, sweetheart",
  undefined,
  { m: "hearts", inner: "background" },
  P.valentine,
  ["hearts"]
);
f(
  "valentine-letter",
  "Love letter",
  "envelope",
  "Scan to open",
  undefined,
  { m: "letter" },
  P.valentineRose,
  ["letter"]
);
f(
  "valentine-dinner",
  "Valentine's dinner",
  "doubleLine",
  "Scan to book a table",
  "Valentine's dinner",
  { m: "glasses" },
  P.valentine,
  ["dinner", "restaurant"]
);
f(
  "valentine-bands",
  "Love bands",
  "twoBands",
  "Scan me",
  "Happy Valentine's Day",
  { noteInk: { mix: ["frame", "#000000"], amount: 0.45 } },
  P.valentine,
  ["bands"]
);

section("holidays", "st-patricks-day", ["st patrick's day", "march", "irish"]);
f(
  "st-patricks-shamrock",
  "Shamrock",
  "cardSolid",
  "Happy St Patrick's Day",
  "Scan me",
  { m: "shamrock", mfill: "text" },
  P.stPat,
  ["shamrock"]
);
f(
  "st-patricks-clover",
  "Lucky clover",
  "seal",
  "Happy St Patrick's Day",
  "Scan for luck",
  { edge: "scallop", m: "clover" },
  P.stPat,
  ["clover"]
);
f(
  "st-patricks-horseshoe",
  "Horseshoe ticket",
  "ticketV",
  "Scan for the party",
  "St Patrick's Day",
  { m: "horseshoe" },
  P.stPat,
  ["party"]
);
f(
  "st-patricks-pub",
  "Pub night",
  "cardBand",
  "Scan for drinks",
  "St Patrick's Day",
  { m: "mug", bandTop: true },
  P.stPat,
  ["pub", "bar"]
);

section("holidays", "mothers-day", ["mother's day", "mom", "may"]);
f(
  "mothers-day-tulip",
  "Tulip arch",
  "arch",
  "Happy Mother's Day",
  undefined,
  { m: "tulip" },
  P.mother,
  ["flowers"]
);
f(
  "mothers-day-daisy",
  "Daisy card",
  "cardPill",
  "Scan for your gift",
  "Happy Mother's Day",
  { m: "daisy" },
  P.motherPlum,
  ["flowers", "gift"]
);
f(
  "mothers-day-photo",
  "Mom's photo",
  "polaroid",
  "Love you, Mom",
  undefined,
  { regular: true },
  P.mother,
  ["photo"]
);
f(
  "mothers-day-brunch",
  "Mother's Day brunch",
  "doubleLine",
  "Scan to book brunch",
  "Mother's Day",
  { m: "blossom" },
  P.motherPlum,
  ["brunch", "restaurant"]
);

section("holidays", "fathers-day", ["father's day", "dad", "june"]);
f(
  "fathers-day-tie",
  "Necktie",
  "cardSolid",
  "Happy Father's Day",
  "Scan me",
  { m: "tie", mfill: "accent", mfill2: "text" },
  P.father,
  ["tie"]
);
f(
  "fathers-day-bow-tie",
  "Bow tie",
  "cardBand",
  "Scan for your gift",
  "Happy Father's Day",
  { m: "bowtie" },
  P.fatherGreen,
  ["gift"]
);
f(
  "fathers-day-trophy",
  "Best dad",
  "shield",
  "Best dad ever",
  undefined,
  { m: "trophy" },
  P.father,
  ["trophy"]
);
f(
  "fathers-day-photo",
  "Dad's photo",
  "polaroid",
  "Love you, Dad",
  undefined,
  { regular: true },
  P.fatherGreen,
  ["photo"]
);

section("holidays", "independence-day", ["independence day", "national day"]);
f(
  "independence-us",
  "Fourth of July",
  "flagBand",
  "Happy Fourth of July",
  undefined,
  {
    stripes: ["accent", "background", "accent", "background", "accent"],
    m: "star5",
    disc: "frame",
    mfill: "text",
    msize: 160,
  },
  P.usa,
  ["usa", "july 4"]
);
f(
  "independence-us-fireworks",
  "Fourth of July fireworks",
  "cardSolid",
  "Scan for the fireworks",
  "Fourth of July",
  { m: "firework", mfill: "text", mfill2: "accent" },
  P.usa,
  ["usa", "fireworks"]
);
f(
  "independence-india",
  "Indian Independence Day",
  "flagBand",
  "Happy Independence Day",
  undefined,
  { stripes: ["accent", "background", "#138808"], m: "chakra", msize: 90 },
  P.india,
  ["india", "august 15"]
);
f(
  "independence-canada",
  "Canada Day",
  "flagBand",
  "Happy Canada Day",
  undefined,
  {
    stripes: ["frame", "background", "background", "frame"],
    vertical: true,
    m: "maple",
    msize: 170,
  },
  P.canada,
  ["canada", "july 1"]
);
f(
  "independence-mexico",
  "Mexican Independence Day",
  "flagBand",
  "Viva México",
  undefined,
  { stripes: ["frame", "background", "accent"], vertical: true },
  P.mexico,
  ["mexico", "september 16"]
);
f(
  "independence-france",
  "Bastille Day",
  "flagBand",
  "Bonne fête nationale",
  undefined,
  { stripes: ["frame", "background", "accent"], vertical: true },
  P.france,
  ["france", "july 14"]
);
f(
  "independence-brazil",
  "Brazilian Independence Day",
  "flagBand",
  "Feliz Independência",
  undefined,
  {
    stripes: ["frame", "accent", "frame"],
    m: "starBadge",
    disc: "background",
    mfill: "frame",
    msize: 160,
  },
  P.brazil,
  ["brazil", "september 7"]
);
f(
  "independence-fireworks",
  "Independence fireworks",
  "seal",
  "Happy Independence Day",
  "Scan me",
  { edge: "rosette", m: "firework" },
  P.indep,
  ["fireworks"]
);

section("holidays", "black-friday", ["black friday", "sale", "deals"]);
f(
  "black-friday-burst",
  "Black Friday burst",
  "burstCorner",
  "Scan for the deals",
  "Sale",
  {},
  P.blackFriday,
  ["burst"]
);
f(
  "black-friday-bolt",
  "Flash deal",
  "cardSolid",
  "Black Friday",
  "Scan for today's deals",
  { m: "bolt", mfill: "accent" },
  P.blackFridayY,
  ["flash sale"]
);
f(
  "black-friday-tab",
  "Sale tab",
  "tabTop",
  "Black Friday",
  "Scan to shop the sale",
  { m: "percent" },
  P.blackFriday,
  ["percent"]
);
f(
  "black-friday-tag",
  "Sale tag",
  "priceTag",
  "Scan for the deals",
  undefined,
  {},
  P.blackFriday,
  ["price tag"]
);
f(
  "black-friday-bands",
  "Sale bands",
  "twoBands",
  "Scan to shop",
  "Black Friday",
  { noteInk: "frame" },
  P.blackFridayY,
  ["bands"]
);

section("holidays", "cyber-monday", ["cyber monday", "sale", "online"]);
f(
  "cyber-monday-browser",
  "Cyber Monday browser",
  "browser",
  "Scan to shop online",
  "Cyber Monday",
  {},
  P.cyber,
  ["online shop"]
);
f(
  "cyber-monday-neon",
  "Cyber Monday neon",
  "neon",
  "Cyber Monday",
  undefined,
  { m: "bolt" },
  P.cyber,
  ["neon"]
);
f(
  "cyber-monday-wide",
  "Cyber Monday wide",
  "landscape",
  "Cyber Monday",
  "Scan for online deals",
  { m: "cursor" },
  P.cyberBlue,
  ["landscape"]
);
f(
  "cyber-monday-ticket",
  "Deal ticket",
  "ticketV",
  "Scan for your code",
  "Cyber Monday",
  { m: "percent" },
  P.cyberBlue,
  ["coupon"]
);

// ════════════════════════════════════════════════════════════════════════════
// Seasons
// ════════════════════════════════════════════════════════════════════════════
section("seasons", "back-to-school", ["back to school", "school", "september"]);
f(
  "school-pencil",
  "Pencil card",
  "cardSolid",
  "Back to school",
  "Scan for the supply list",
  { m: "pencil", mfill: "accent", mfill2: "text" },
  P.school,
  ["pencil"]
);
f(
  "school-ruler",
  "Ruler band",
  "cardBand",
  "Scan for the timetable",
  "Back to school",
  { m: "ruler" },
  P.school,
  ["timetable"]
);
f(
  "school-book",
  "Open book",
  "arch",
  "Back to school",
  undefined,
  { m: "book", solid: true, fill: "text" },
  P.schoolRed,
  ["book"]
);
f(
  "school-notebook",
  "Notebook",
  "stitched",
  "Scan for class info",
  "Back to school",
  { m: "pencil", light: true },
  P.school,
  ["notebook"]
);
f(
  "school-calendar",
  "School calendar",
  "calendar",
  "Scan for term dates",
  "Back to school",
  {},
  P.schoolRed,
  ["calendar"]
);
f(
  "school-palette",
  "Art class",
  "sticker",
  "Back to school",
  undefined,
  { m: "palette", inner: "background" },
  P.school,
  ["art"]
);

section("seasons", "summer", ["summer", "sun", "beach"]);
f(
  "summer-sun-scene",
  "Summer hills",
  "scene",
  "Scan me",
  "Hello summer",
  { m: "sun" },
  P.summerSun,
  ["sun"]
);
f(
  "summer-waves",
  "Summer waves",
  "waveBand",
  "Scan for summer hours",
  "Hello summer",
  { m: "sun" },
  P.summer,
  ["waves", "hours"]
);
f(
  "summer-parasol",
  "Beach umbrella",
  "cardBand",
  "Scan me",
  "Hello summer",
  { m: "parasol" },
  P.summer,
  ["beach"]
);
f(
  "summer-ice-pop",
  "Ice pop",
  "sticker",
  "Stay cool",
  undefined,
  { m: "popsicle", inner: "background" },
  P.summerSun,
  ["ice cream"]
);
f(
  "summer-palm",
  "Palm arch",
  "arch",
  "Scan for summer deals",
  undefined,
  { m: "palm" },
  P.summer,
  ["palm", "sale"]
);
f(
  "summer-shell",
  "Seashell",
  "doubleLine",
  "Scan me",
  "Summer by the sea",
  { m: "shell" },
  P.summer,
  ["sea"]
);

section("seasons", "winter", ["winter", "snow", "cold"]);
f(
  "winter-crystal",
  "Snow crystal",
  "cardSolid",
  "Scan me",
  "Hello winter",
  { m: "crystal", mfill: "accent" },
  P.winter,
  ["snowflake"]
);
f(
  "winter-peaks",
  "Snowy peaks",
  "scene",
  "Scan for slope info",
  "Winter season",
  {
    m: "mountain",
    sky: { mix: ["accent", "background"], amount: 0.6 },
    hill1: "accent",
    mx: 930,
    mfill: "frame",
    mfill2: "background",
  },
  P.winter,
  ["mountains", "ski"]
);
f(
  "winter-mitten",
  "Mitten",
  "cardBand",
  "Stay warm",
  "Scan me",
  { m: "mitten" },
  P.winterSlate,
  ["mitten"]
);
f(
  "winter-cocoa",
  "Hot drinks",
  "cupShape",
  "Hot drinks inside",
  undefined,
  { sleeveInk: "frame" },
  P.winterSlate,
  ["hot drinks", "cafe"]
);
f(
  "winter-snow-seal",
  "Winter seal",
  "seal",
  "Hello winter",
  "Scan me",
  { edge: "scallop", light: true, m: "crystal" },
  P.winter,
  ["badge"]
);

section("seasons", "spring", ["spring", "flowers"]);
f(
  "spring-blossom",
  "Blossom branch",
  "cardBand",
  "Hello spring",
  "Scan me",
  { m: "cherryBranch" },
  P.spring,
  ["blossom"]
);
f(
  "spring-tulip",
  "Spring tulip",
  "arch",
  "Scan for spring deals",
  undefined,
  { m: "tulip" },
  P.springLilac,
  ["tulip", "sale"]
);
f(
  "spring-butterfly",
  "Butterfly",
  "cardPill",
  "Scan me",
  "Hello spring",
  { m: "butterfly" },
  P.spring,
  ["butterfly"]
);
f(
  "spring-sprout",
  "Sprout",
  "stitched",
  "Spring is here",
  "Scan me",
  { m: "sprout", light: true },
  P.spring,
  ["garden"]
);
f(
  "spring-daisy",
  "Daisy seal",
  "seal",
  "Hello spring",
  "Scan me",
  { edge: "scallop", m: "daisy" },
  P.springLilac,
  ["daisy"]
);

section("seasons", "autumn", ["autumn", "fall", "leaves"]);
f(
  "autumn-maple",
  "Falling leaf",
  "cardSolid",
  "Hello autumn",
  "Scan me",
  { m: "maple", mfill: "accent" },
  P.autumn,
  ["maple"]
);
f(
  "autumn-oak",
  "Oak leaf",
  "cardBand",
  "Scan for fall hours",
  "Autumn",
  { m: "oak" },
  P.autumnOlive,
  ["oak", "hours"]
);
f(
  "autumn-acorn",
  "Acorn sticker",
  "sticker",
  "Hello autumn",
  undefined,
  { m: "acorn", inner: "background" },
  P.autumn,
  ["acorn"]
);
f(
  "autumn-hills",
  "Autumn hills",
  "scene",
  "Scan me",
  "Hello autumn",
  { m: "sun", mfill: "accent" },
  P.autumnOlive,
  ["hills"]
);
f(
  "autumn-wheat",
  "Harvest",
  "doubleLine",
  "See the harvest menu",
  "Autumn",
  { m: "wheat" },
  P.autumn,
  ["harvest", "menu"]
);

// ════════════════════════════════════════════════════════════════════════════
// Food and drink
// ════════════════════════════════════════════════════════════════════════════
section("food-drink", undefined, ["restaurant", "food"], ["url"]);
f(
  "menu-cutlery",
  "Menu card",
  "cardBand",
  "Scan for the menu",
  undefined,
  { m: "cutlery" },
  MONO,
  ["menu"]
);
f(
  "menu-cloche",
  "Serving dome",
  "doubleLine",
  "Scan for our menu",
  "Bon appétit",
  { m: "cloche" },
  MONO,
  ["menu", "fine dining"]
);
f(
  "menu-chef",
  "Chef's specials",
  "chalkboard",
  "Scan for the specials",
  "Chef's specials",
  {},
  { ...MONO, accent: "#5a5a5a" },
  ["specials"]
);
f(
  "menu-chalkboard",
  "Menu board",
  "chalkboard",
  "Scan for the menu",
  undefined,
  {},
  { ...MONO, accent: "#8a8a8a" },
  ["menu"]
);
f(
  "menu-arch",
  "Bistro arch",
  "arch",
  "Scan for the menu",
  undefined,
  { m: "cutlery" },
  MONO,
  ["menu", "bistro"]
);
f(
  "menu-noodles",
  "Noodle bar",
  "circleTop",
  "Scan to order",
  "Noodle bar",
  { m: "bowl" },
  MONO,
  ["asian", "ordering"]
);
f(
  "menu-pizza",
  "Pizza sticker",
  "sticker",
  "Scan to order pizza",
  undefined,
  { m: "pizza", inner: "background", mfill2: "background" },
  MONO,
  ["pizza", "ordering"]
);
f(
  "order-here-tab",
  "Order here",
  "tabTop",
  "Order here",
  "Scan, order, relax",
  { m: "chefHat" },
  MONO,
  ["ordering"]
);
f(
  "order-pickup",
  "Pickup order",
  "bag",
  "Scan to order ahead",
  undefined,
  {},
  MONO,
  ["takeaway", "pickup"]
);
f(
  "pay-at-table",
  "Pay at table",
  "cardPill",
  "Scan to pay",
  "Pay at your table",
  { m: "receipt" },
  MONO,
  ["payments", "table"],
  ["upi", "paypal", "url"]
);
f(
  "food-truck",
  "Food truck",
  "awning",
  "Scan for the menu",
  undefined,
  {},
  MONO,
  ["food truck", "street food"]
);
f(
  "rate-your-meal",
  "Rate your meal",
  "laurel",
  "Rate your meal",
  "Thank you!",
  {},
  SOFT,
  ["reviews"],
  ["google-review", "url"]
);
f(
  "allergen-info",
  "Allergen info",
  "cardSolid",
  "Scan for allergen info",
  "Allergens",
  { m: "icon:info" },
  MONO,
  ["allergens", "nutrition"]
);
f(
  "table-number",
  "Table number",
  "twoBands",
  "Scan to order",
  "Table 7",
  { noteInk: "frame" },
  SOFT,
  ["table", "ordering"]
);
f(
  "bakery-cake",
  "Bakery",
  "arch",
  "Scan to order a cake",
  undefined,
  { m: "cake" },
  MONO,
  ["bakery", "cake"]
);
f(
  "ice-cream-shop",
  "Ice cream shop",
  "awning",
  "Scan for flavors",
  undefined,
  { light: true },
  SOFT,
  ["ice cream", "dessert"]
);
f(
  "cafe-cup",
  "Takeaway cup",
  "cupShape",
  "Scan for the menu",
  undefined,
  { sleeveInk: "frame" },
  SOFT,
  ["cafe", "coffee"]
);
f(
  "cafe-bean",
  "Coffee bean",
  "circleTop",
  "Scan for our coffee",
  "Freshly roasted",
  { m: "bean" },
  MONO,
  ["cafe", "coffee"]
);
f(
  "cafe-steam",
  "Hot coffee",
  "cardBand",
  "Scan to order",
  "Coffee to go",
  { m: "steam", bandTop: true },
  MONO,
  ["cafe", "coffee"]
);
f(
  "cafe-loyalty",
  "Coffee loyalty",
  "ticketV",
  "Scan for your stamp",
  "Coffee club",
  { m: "bean" },
  MONO,
  ["cafe", "loyalty"]
);
f(
  "cafe-menu-board",
  "Cafe board",
  "chalkboard",
  "Scan for the cafe menu",
  undefined,
  {},
  { ...MONO, accent: "#6e6e6e" },
  ["cafe", "menu"]
);
f(
  "cafe-wifi",
  "Cafe Wi-Fi",
  "cardPill",
  "Scan for free Wi-Fi",
  "Enjoy your coffee",
  { m: "icon:cup" },
  MONO,
  ["cafe", "wifi"],
  ["wifi"]
);
f(
  "bar-cocktail",
  "Cocktail neon",
  "neon",
  "Scan for cocktails",
  undefined,
  { m: "martini" },
  NEON,
  ["bar", "cocktails"]
);
f(
  "bar-wine",
  "Wine list",
  "doubleLine",
  "Scan for the wine list",
  "Wine bar",
  { m: "wineGlass" },
  MONO,
  ["bar", "wine"]
);
f(
  "bar-beer",
  "Beer tap",
  "cardSolid",
  "Scan for what's on tap",
  "Craft beer",
  { m: "mug", mfill: "text", mfill2: "accent" },
  NEON,
  ["bar", "beer"]
);
f(
  "bar-happy-hour",
  "Happy hour",
  "burstCorner",
  "Scan for happy hour",
  "5-7 pm",
  { burstInk: "frame" },
  SOFT,
  ["bar", "happy hour"]
);
f(
  "bar-bottle",
  "Bottle label",
  "jarLabel",
  "Scan for the story",
  "Small batch",
  { m: "bottle" },
  MONO,
  ["bar", "drinks", "label"]
);
f("bar-tab", "Open a tab", "tabBottom", "Scan to open a tab", "Bar", {}, MONO, [
  "bar",
  "payments",
]);
f(
  "restaurant-booking",
  "Book a table",
  "calendar",
  "Scan to book a table",
  "Reservations",
  {},
  MONO,
  ["booking", "reservations"]
);
f(
  "restaurant-delivery",
  "Delivery",
  "landscape",
  "Order for delivery",
  "Scan to order online",
  { m: "bag" },
  MONO,
  ["delivery", "ordering"]
);

// ════════════════════════════════════════════════════════════════════════════
// Shops and packaging
// ════════════════════════════════════════════════════════════════════════════
section("shopping", undefined, ["retail", "shop"], ["url"]);
f("shop-bag", "Shopping bag", "bag", "Scan to shop", undefined, {}, MONO, [
  "shopping",
]);
f(
  "shop-awning",
  "Shop front",
  "awning",
  "Scan to shop online",
  undefined,
  {},
  MONO,
  ["store front"]
);
f(
  "shop-sale-burst",
  "Sale burst",
  "burstCorner",
  "Scan for the sale",
  "Sale",
  { burstInk: "frame" },
  SOFT,
  ["sale"]
);
f(
  "shop-sale-tag",
  "Price tag",
  "priceTag",
  "Scan for the price",
  undefined,
  {},
  MONO,
  ["price"]
);
f(
  "shop-percent",
  "Percent off",
  "cardSolid",
  "Scan for the discount",
  "Sale",
  { m: "percent" },
  MONO,
  ["sale", "discount"]
);
f(
  "shop-coupon",
  "Coupon",
  "coupon",
  "Scan to redeem",
  "Your coupon",
  {},
  MONO,
  ["coupon", "discount"]
);
f(
  "shop-new-arrivals",
  "New arrivals",
  "ribbon",
  "New arrivals",
  "Scan to see them all",
  { m: "icon:sparkle" },
  MONO,
  ["new"]
);
f(
  "shop-cart",
  "Shop online",
  "landscape",
  "Shop online",
  "Scan to browse the range",
  { m: "cart" },
  MONO,
  ["online shop"]
);
f(
  "shop-fashion",
  "Fashion tag",
  "hangTag",
  "Scan for sizes",
  undefined,
  {},
  MONO,
  ["fashion", "clothing"]
);
f(
  "shop-hanger",
  "Clothing",
  "circleTop",
  "Scan to see the look",
  "New season",
  { m: "hanger" },
  MONO,
  ["fashion", "clothing"]
);
f(
  "shop-tshirt",
  "Merch",
  "sticker",
  "Scan for merch",
  undefined,
  { m: "shirt", inner: "background" },
  MONO,
  ["merch", "clothing"]
);
f(
  "shop-jewelry",
  "Jewelry",
  "doubleLine",
  "See the collection",
  "Jewelry",
  { m: "gem" },
  MONO,
  ["jewelry", "luxury"]
);
f(
  "shop-gift-card",
  "Gift card",
  "giftBox",
  "Scan for gift cards",
  undefined,
  {},
  SOFT,
  ["gift card", "gift"]
);
f(
  "shop-loyalty",
  "Loyalty card",
  "landscape",
  "Join our rewards",
  "Scan to sign up",
  { m: "icon:star", light: true, codeRight: true, bar: true },
  MONO,
  ["loyalty", "rewards"]
);
f(
  "shop-price-check",
  "Price check",
  "corners",
  "Scan to check the price",
  undefined,
  { tintBg: true },
  MONO,
  ["price"]
);
f(
  "shop-window-sticker",
  "Window sticker",
  "seal",
  "Scan to shop",
  "Open online 24/7",
  { light: true, m: "icon:bag" },
  MONO,
  ["window", "sticker"]
);
f(
  "pack-instructions",
  "Instructions",
  "cardBand",
  "Scan for instructions",
  undefined,
  { m: "book" },
  MONO,
  ["packaging", "instructions"]
);
f(
  "pack-recycle",
  "Recycle me",
  "stitched",
  "Scan to recycle right",
  "Recycling info",
  { m: "recycle", light: true },
  MONO,
  ["packaging", "recycling"]
);
f(
  "pack-eco",
  "Eco info",
  "cardSolid",
  "Scan for our footprint",
  "Sustainability",
  { m: "leafEco", mfill: "text", mfill2: "frame" },
  MONO,
  ["packaging", "sustainability"]
);
f(
  "pack-parcel",
  "Parcel",
  "stamp",
  "Track your order",
  "Thanks for ordering",
  { m: "box", light: true },
  MONO,
  ["packaging", "shipping"]
);
f(
  "pack-label",
  "Product label",
  "jarLabel",
  "Scan for ingredients",
  "Ingredients",
  { m: "leafEco", light: true },
  MONO,
  ["packaging", "ingredients"]
);
f(
  "pack-reorder",
  "Reorder",
  "tabTop",
  "Scan to reorder",
  "Running low?",
  { m: "cart" },
  MONO,
  ["packaging", "reorder"]
);
f(
  "pack-authentic",
  "Authentic",
  "seal",
  "Scan to verify",
  "Genuine product",
  { edge: "rosette", m: "icon:check" },
  MONO,
  ["packaging", "authenticity"]
);
f(
  "pack-warranty",
  "Warranty",
  "circleTop",
  "Scan to register",
  "Warranty",
  { m: "icon:check" },
  MONO,
  ["packaging", "warranty"]
);
f(
  "pack-unboxing",
  "Unboxing",
  "giftBox",
  "Scan to say thanks",
  undefined,
  {},
  MONO,
  ["packaging", "thank you"]
);
f(
  "pack-care",
  "Care guide",
  "hangTag",
  "Scan for care tips",
  undefined,
  { light: true },
  MONO,
  ["packaging", "care"]
);
f(
  "pack-video-guide",
  "Video guide",
  "phone",
  "Watch the setup video",
  undefined,
  { m: "play", light: true },
  MONO,
  ["packaging", "video"]
);

// ════════════════════════════════════════════════════════════════════════════
// Events and weddings
// ════════════════════════════════════════════════════════════════════════════
section("events", undefined, ["events"], ["url"]);
f(
  "event-concert",
  "Concert ticket",
  "ticketH",
  "Scan to enter",
  "Live music",
  { m: "music" },
  MONO,
  ["concert", "music", "tickets"]
);
f(
  "event-cinema",
  "Film night",
  "filmStrip",
  "Scan for showtimes",
  "Film night",
  {},
  MONO,
  ["cinema", "film"]
);
f(
  "event-comedy",
  "Comedy night",
  "ticketV",
  "Comedy night",
  "Scan for tickets",
  { m: "mic" },
  MONO,
  ["comedy", "tickets"]
);
f(
  "event-theatre",
  "Theatre",
  "doubleLine",
  "Scan for the program",
  "Tonight's performance",
  { m: "mask" },
  MONO,
  ["theatre", "program"]
);
f(
  "event-festival",
  "Festival",
  "bunting",
  "Scan for the lineup",
  undefined,
  {},
  SOFT,
  ["festival", "lineup"]
);
f(
  "event-party",
  "Party",
  "cardBand",
  "Scan to RSVP",
  "You're invited",
  { m: "balloon" },
  MONO,
  ["party", "rsvp"]
);
f(
  "event-birthday",
  "Birthday",
  "arch",
  "Scan to RSVP",
  undefined,
  { m: "cake" },
  MONO,
  ["birthday", "party"]
);
f(
  "event-save-the-date",
  "Save the date",
  "calendar",
  "Scan for the details",
  "Save the date",
  {},
  MONO,
  ["save the date"]
);
f(
  "event-badge",
  "Name badge",
  "lanyard",
  "Scan to connect",
  "Hello",
  {},
  MONO,
  ["conference", "badge", "networking"]
);
f(
  "event-agenda",
  "Agenda",
  "cardBand",
  "Scan for the agenda",
  undefined,
  { m: "icon:clock" },
  MONO,
  ["conference", "agenda"]
);
f(
  "event-check-in",
  "Event check-in",
  "corners",
  "Scan to check in",
  "Welcome",
  {},
  MONO,
  ["check-in"]
);
f(
  "event-wristband",
  "Admission",
  "ticketH",
  "Scan at the gate",
  "All access",
  { m: "star5", light: true },
  MONO,
  ["tickets", "admission"]
);
f(
  "event-raffle",
  "Raffle ticket",
  "ticketV",
  "Scan to enter the raffle",
  "Good luck",
  { light: true, m: "icon:gift" },
  MONO,
  ["raffle", "giveaway"]
);
f(
  "event-announcement",
  "Announcements",
  "bubbleFrame",
  "Scan for updates",
  "Live announcements",
  { m: "megaphone", tail: "left" },
  MONO,
  ["updates"]
);
f(
  "event-photos",
  "Event photos",
  "polaroid",
  "Share your photos",
  undefined,
  {},
  MONO,
  ["photos"]
);
f(
  "event-livestream",
  "Livestream",
  "phone",
  "Watch live",
  "Scan to tune in",
  { m: "play", button: true },
  MONO,
  ["livestream", "video"]
);
f(
  "event-sports",
  "Match day",
  "shield",
  "Scan for match info",
  undefined,
  { m: "trophy" },
  { ...MONO, accent: "#3a3a3a" },
  ["sports", "match"]
);
f(
  "event-race",
  "Race results",
  "cardSolid",
  "Scan for your results",
  "Race day",
  { m: "medal", mfill: "text", mfill2: "text" },
  MONO,
  ["race", "results"]
);
f(
  "event-exhibit",
  "Exhibition",
  "sideBar",
  "Scan for the guide",
  "Exhibition",
  { m: "palette" },
  SOFT,
  ["exhibition", "gallery"]
);
section("events", undefined, ["wedding", "events"], ["url"]);
f(
  "wedding-rings",
  "Wedding rings",
  "arch",
  "Scan to RSVP",
  undefined,
  { m: "rings" },
  MONO,
  ["rsvp"]
);
f(
  "wedding-invitation",
  "Invitation",
  "doubleLine",
  "Scan to RSVP",
  "Join us as we marry",
  { m: "rings" },
  SOFT,
  ["invitation", "rsvp"]
);
f(
  "wedding-toast",
  "Toast",
  "doubleLine",
  "Scan for the menu",
  "Let's raise a glass",
  { m: "glasses" },
  MONO,
  ["reception", "menu"]
);
f(
  "wedding-photos",
  "Wedding photos",
  "polaroid",
  "Send us your photos",
  undefined,
  { regular: true },
  MONO,
  ["photos"]
);
f(
  "wedding-registry",
  "Gift registry",
  "giftBox",
  "Scan for our registry",
  undefined,
  {},
  SOFT,
  ["registry", "gift"]
);
f(
  "wedding-welcome",
  "Welcome sign",
  "arch",
  "Welcome to our wedding",
  undefined,
  { m: "bow", solid: true, fill: "text" },
  MONO,
  ["welcome sign"]
);
f(
  "wedding-seating",
  "Seating chart",
  "cardBand",
  "Find your seat",
  "See the seating chart",
  { bandTop: true },
  MONO,
  ["seating"]
);
f(
  "wedding-letter",
  "Wedding letter",
  "envelope",
  "Scan to RSVP",
  undefined,
  { m: "letter", light: true },
  MONO,
  ["invitation"]
);
f(
  "wedding-seal",
  "Wedding seal",
  "seal",
  "Scan to RSVP",
  "We're getting married",
  { light: true, edge: "scallop", m: "rings" },
  MONO,
  ["save the date"]
);

// ════════════════════════════════════════════════════════════════════════════
// Places and Wi-Fi
// ════════════════════════════════════════════════════════════════════════════
section("places", undefined, ["wifi"], ["wifi"]);
f("wifi-tile", "Wi-Fi tile", "compact", "Scan for Wi-Fi", undefined, {}, MONO, [
  "minimal",
]);
f(
  "wifi-tab",
  "Wi-Fi tab",
  "tabBottom",
  "Free Wi-Fi",
  "Scan to connect",
  {},
  MONO,
  ["tab"]
);
f(
  "wifi-seal",
  "Wi-Fi badge",
  "seal",
  "Free Wi-Fi",
  "Scan to connect",
  { light: true, m: "icon:wifi" },
  MONO,
  ["badge"]
);
f(
  "wifi-sticker",
  "Wi-Fi sticker",
  "sticker",
  "Scan to join Wi-Fi",
  undefined,
  { m: "icon:wifi", inner: "background" },
  MONO,
  ["sticker"]
);
f(
  "wifi-wide",
  "Wi-Fi wide card",
  "landscape",
  "Guest Wi-Fi",
  "Scan to connect",
  { m: "icon:wifi" },
  MONO,
  ["landscape", "guest"]
);
f(
  "wifi-bubble",
  "Wi-Fi bubble",
  "bubbleTop",
  "Free Wi-Fi here",
  "Scan to connect",
  {},
  MONO,
  ["speech bubble"]
);
f(
  "wifi-circle-top",
  "Wi-Fi badge card",
  "circleTop",
  "Scan to connect",
  "Guest Wi-Fi",
  { m: "icon:wifi" },
  MONO,
  ["guest"]
);
f(
  "wifi-corners",
  "Wi-Fi viewfinder",
  "corners",
  "Scan to join Wi-Fi",
  "Free for guests",
  {},
  MONO,
  ["minimal"]
);
section("places", undefined, ["hotel", "hospitality"], ["url"]);
f(
  "hotel-room-service",
  "Room service",
  "doorHanger",
  "Room service",
  "Scan to order",
  {},
  MONO,
  ["room service"]
);
f(
  "hotel-hanger-light",
  "Light door hanger",
  "doorHanger",
  "Scan for hotel info",
  "Welcome",
  { light: true },
  MONO,
  ["guest info"]
);
f(
  "hotel-key",
  "Room key",
  "landscape",
  "Your stay",
  "Scan for guest info",
  { m: "key" },
  MONO,
  ["key card", "guest info"]
);
f(
  "hotel-bed",
  "Guest guide",
  "cardBand",
  "Scan for the guest guide",
  undefined,
  { m: "bed" },
  MONO,
  ["guest info"]
);
f(
  "hotel-concierge",
  "Concierge",
  "chatPair",
  "Ask the concierge",
  "Need anything?",
  { m: "icon:user" },
  MONO,
  ["concierge", "chat"]
);
f(
  "hotel-check-out",
  "Express check-out",
  "cardPill",
  "Scan to check out",
  "Thank you for staying",
  { m: "suitcase" },
  MONO,
  ["check-out"]
);
f(
  "hotel-breakfast",
  "Breakfast",
  "doubleLine",
  "Scan for breakfast hours",
  "Good morning",
  { m: "steam" },
  MONO,
  ["breakfast"]
);
section("places", undefined, ["travel"], ["url"]);
f(
  "travel-boarding-pass",
  "Boarding pass",
  "boardingPass",
  "Scan for your trip",
  "Boarding pass",
  {},
  MONO,
  ["flights"]
);
f(
  "travel-compass",
  "Explore",
  "circleTop",
  "Explore the area",
  "Scan for the map",
  { m: "compass" },
  MONO,
  ["map", "tourism"]
);
f(
  "travel-tour",
  "Audio tour",
  "cardSolid",
  "Scan for the audio tour",
  "Self-guided",
  { m: "icon:headphones" },
  MONO,
  ["tour", "audio"]
);
f(
  "travel-trail",
  "Trail map",
  "scene",
  "Scan for the trail map",
  "Trailhead",
  { m: "mountain", mfill: "frame", mfill2: "background" },
  SOFT,
  ["hiking", "map"]
);
f(
  "travel-excursions",
  "Excursions",
  "arch",
  "Scan to book a tour",
  undefined,
  { m: "palm" },
  MONO,
  ["tours", "booking"]
);
f(
  "travel-city-guide",
  "City guide",
  "skyline",
  "Scan for the city guide",
  "Welcome",
  {},
  MONO,
  ["city guide"]
);
f(
  "travel-luggage",
  "Luggage tag",
  "hangTag",
  "If found, please scan",
  undefined,
  {},
  MONO,
  ["luggage", "lost and found"]
);
f(
  "travel-directions",
  "Find us",
  "cardBand",
  "Scan for directions",
  undefined,
  { m: "icon:pin", bandTop: true },
  MONO,
  ["directions"],
  ["location", "url"]
);
section("real-estate", undefined, ["real estate", "property"], ["url"]);
f(
  "property-for-sale",
  "For sale sign",
  "hangingSign",
  "Scan for details",
  undefined,
  {},
  MONO,
  ["for sale", "signage"]
);
f(
  "property-house",
  "House",
  "house",
  "Scan for the listing",
  undefined,
  {},
  MONO,
  ["listing"]
);
f(
  "property-house-light",
  "Light house",
  "house",
  "Scan to book a viewing",
  undefined,
  { light: true, m: "key" },
  MONO,
  ["viewing"]
);
f(
  "property-open-house",
  "Open house",
  "cardSolid",
  "Open house",
  "Scan for times",
  { m: "door", mfill: "text", mfill2: "frame" },
  MONO,
  ["open house"]
);
f(
  "property-floor-plan",
  "Floor plans",
  "cardBand",
  "Scan for floor plans",
  undefined,
  { m: "building" },
  MONO,
  ["floor plans", "apartments"]
);
f(
  "property-virtual-tour",
  "Virtual tour",
  "landscape",
  "Take the virtual tour",
  "Scan to look inside",
  { m: "play" },
  MONO,
  ["virtual tour", "video"]
);
f(
  "property-rent",
  "For rent",
  "twoBands",
  "Scan to apply",
  "For rent",
  { noteInk: "frame" },
  SOFT,
  ["rental"]
);
f(
  "property-key",
  "Keys",
  "circleTop",
  "Scan for move-in info",
  "Welcome home",
  { m: "key" },
  MONO,
  ["move-in"]
);

// ════════════════════════════════════════════════════════════════════════════
// Health, fitness and learning
// ════════════════════════════════════════════════════════════════════════════
section("health-learning", undefined, ["healthcare", "clinic"], ["url"]);
f(
  "health-check-in",
  "Clinic check-in",
  "cardBand",
  "Scan to check in",
  undefined,
  { m: "plus" },
  MONO,
  ["check-in"]
);
f(
  "health-portal",
  "Patient portal",
  "cardSolid",
  "Open the patient portal",
  "Your health",
  { m: "pulse", mfill: "text" },
  MONO,
  ["patient portal"]
);
f(
  "health-medication",
  "Medication info",
  "hangTag",
  "Scan for dosage info",
  undefined,
  {},
  MONO,
  ["pharmacy", "medication"]
);
f(
  "health-pharmacy",
  "Pharmacy",
  "circleTop",
  "Scan to refill",
  "Pharmacy",
  { m: "pill" },
  MONO,
  ["pharmacy"]
);
f(
  "health-dental",
  "Dental",
  "cardPill",
  "Book your next visit",
  "Dental care",
  { m: "tooth" },
  MONO,
  ["dental", "booking"]
);
f(
  "health-appointment",
  "Appointment",
  "calendar",
  "Scan to book",
  "Appointments",
  {},
  MONO,
  ["booking"]
);
f(
  "health-waiting-room",
  "Waiting room",
  "corners",
  "Scan to join the queue",
  "Welcome",
  {},
  MONO,
  ["queue"]
);
f(
  "health-pet",
  "Vet clinic",
  "sticker",
  "Scan to book a visit",
  undefined,
  { m: "paw", inner: "background" },
  MONO,
  ["vet", "pets"]
);
section("sports-fitness", undefined, ["fitness", "gym"], ["url"]);
f(
  "fitness-schedule",
  "Class schedule",
  "cardBand",
  "Scan for the timetable",
  undefined,
  { m: "dumbbell" },
  MONO,
  ["classes"]
);
f(
  "fitness-kettlebell",
  "Kettlebell",
  "cardSolid",
  "Scan for your workout",
  "Train with us",
  { m: "kettlebell", mfill: "text" },
  MONO,
  ["workout"]
);
f(
  "fitness-timer",
  "Workout timer",
  "circleTop",
  "Track your workout",
  "Gym",
  { m: "stopwatch" },
  MONO,
  ["tracking"]
);
f(
  "fitness-challenge",
  "Challenge",
  "shield",
  "Join the challenge",
  undefined,
  { m: "medal" },
  { ...MONO, accent: "#3a3a3a" },
  ["challenge"]
);
f(
  "fitness-yoga",
  "Yoga studio",
  "arch",
  "Scan to book a class",
  undefined,
  { m: "lotus" },
  MONO,
  ["yoga", "booking"]
);
f(
  "fitness-trial",
  "Free trial",
  "burstCorner",
  "Scan for a free trial",
  "Free",
  { burstInk: "frame" },
  SOFT,
  ["trial", "offer"]
);
f(
  "fitness-equipment",
  "Equipment guide",
  "tabTop",
  "How to use this",
  "Scan for the video",
  { m: "play" },
  MONO,
  ["equipment", "video"]
);
section("health-learning", undefined, ["education", "school"], ["url"]);
f(
  "edu-course",
  "Course info",
  "cardBand",
  "Scan for course info",
  undefined,
  { m: "mortarboard" },
  MONO,
  ["course"]
);
f(
  "edu-library",
  "Library",
  "arch",
  "Scan to borrow",
  undefined,
  { m: "book" },
  MONO,
  ["library"]
);
f(
  "edu-assignment",
  "Assignment",
  "stitched",
  "Scan for the assignment",
  "Homework",
  { m: "pencil", light: true },
  MONO,
  ["homework"]
);
f(
  "edu-lab",
  "Lab safety",
  "cardSolid",
  "Scan for lab safety",
  "Science lab",
  { m: "flask", mfill: "text", mfill2: "text" },
  MONO,
  ["science", "safety"]
);
f(
  "edu-idea",
  "Learn more",
  "circleTop",
  "Scan to learn more",
  "Did you know?",
  { m: "lightbulb" },
  MONO,
  ["learning"]
);
f(
  "edu-attendance",
  "Class attendance",
  "corners",
  "Scan to sign in",
  "Attendance",
  {},
  MONO,
  ["attendance"],
  ["attendance", "url"]
);
f(
  "edu-exam",
  "Exam timer",
  "ticketV",
  "Scan for exam info",
  "Exams",
  { m: "hourglass" },
  MONO,
  ["exams"]
);
f(
  "edu-graduation",
  "Graduation",
  "seal",
  "Congrats, graduates",
  "Scan for photos",
  { edge: "rosette", m: "mortarboard" },
  MONO,
  ["graduation"]
);
f(
  "edu-open-day",
  "Open day",
  "bunting",
  "Scan to register",
  undefined,
  {},
  MONO,
  ["open day", "registration"]
);

// ════════════════════════════════════════════════════════════════════════════
// Business and social
// ════════════════════════════════════════════════════════════════════════════
section(
  "business",
  undefined,
  ["reviews", "feedback"],
  ["google-review", "url"]
);
f(
  "review-star",
  "Star review",
  "circleTop",
  "Leave us a review",
  "How did we do?",
  { m: "star5" },
  MONO,
  ["rating"]
);
f(
  "review-quote",
  "Quote review",
  "cardSolid",
  "Leave a review",
  "Tell others about us",
  { m: "quote", mfill: "text", mfill2: "text" },
  MONO,
  ["testimonial"]
);
f(
  "review-thumb",
  "Thumbs up",
  "sticker",
  "Liked it? Review us",
  undefined,
  { m: "thumb", inner: "background" },
  MONO,
  ["rating"]
);
f(
  "review-laurel",
  "Top rated",
  "laurel",
  "Leave a review",
  "Top rated",
  {},
  SOFT,
  ["rating"]
);
f(
  "review-bubble",
  "Review bubble",
  "bubbleFrame",
  "How did we do?",
  "Scan to rate us",
  { m: "icon:star", tail: "center" },
  MONO,
  ["rating"]
);
f(
  "review-ribbon",
  "Review ribbon",
  "ribbon",
  "Rate us",
  "It takes a minute",
  { m: "starRound" },
  MONO,
  ["rating"]
);
f(
  "feedback-survey",
  "Survey",
  "chatPair",
  "Take our survey",
  "Got a minute?",
  { m: "icon:check" },
  MONO,
  ["survey"],
  ["url"]
);
section("business", undefined, ["payments"], ["upi", "paypal", "url"]);
f(
  "pay-card",
  "Card payment",
  "cardBand",
  "Scan to pay",
  undefined,
  { m: "card" },
  MONO,
  ["checkout"]
);
f(
  "pay-wallet",
  "Wallet",
  "landscape",
  "Scan to pay",
  "Fast and contactless",
  { m: "wallet" },
  MONO,
  ["checkout", "landscape"]
);
f(
  "pay-tap",
  "Tap to pay",
  "tabTop",
  "Tap or scan to pay",
  undefined,
  { m: "tap" },
  MONO,
  ["contactless"]
);
f(
  "pay-tips",
  "Tips welcome",
  "cupShape",
  "Tips appreciated",
  undefined,
  { sleeveInk: "frame" },
  SOFT,
  ["tips"]
);
f(
  "pay-receipt",
  "Digital receipt",
  "receipt",
  "Scan for your receipt",
  "Thank you",
  {},
  MONO,
  ["receipt"]
);
f(
  "pay-invoice",
  "Pay invoice",
  "doubleLine",
  "Scan to pay this invoice",
  "Invoice",
  { m: "bank" },
  MONO,
  ["invoice"]
);
f(
  "pay-donate-heart",
  "Donation card",
  "cardSolid",
  "Scan to donate",
  "Every gift helps",
  { m: "icon:heart" },
  MONO,
  ["charity", "donations"]
);
f(
  "pay-coins",
  "Pay here",
  "corners",
  "Pay here",
  "Use your banking app",
  {},
  MONO,
  ["checkout"]
);
section(
  "business",
  undefined,
  ["social", "followers"],
  ["url", "instagram", "tiktok", "facebook"]
);
f(
  "social-hashtag",
  "Hashtag",
  "cardSolid",
  "Follow us",
  "Scan for our socials",
  { m: "hashtag", mfill: "text" },
  MONO,
  ["hashtag"]
);
f(
  "social-camera",
  "Photo feed",
  "polaroid",
  "Follow our photos",
  undefined,
  {},
  MONO,
  ["photos"]
);
f(
  "social-video",
  "Video channel",
  "phone",
  "Watch our videos",
  "Scan to subscribe",
  { m: "play" },
  MONO,
  ["video"]
);
f(
  "social-music",
  "Playlist",
  "cardBand",
  "Listen to our playlist",
  undefined,
  { m: "music" },
  MONO,
  ["music", "playlist"]
);
f(
  "social-newsletter",
  "Newsletter",
  "envelope",
  "Join our newsletter",
  undefined,
  { m: "mail" },
  MONO,
  ["newsletter", "email"]
);
f(
  "social-links",
  "All our links",
  "browser",
  "All our links",
  "Scan to open",
  {},
  MONO,
  ["link in bio"]
);
f(
  "social-follow-bubble",
  "Follow bubble",
  "bubbleTop",
  "Follow us",
  "New posts every week",
  { round: true },
  MONO,
  ["speech bubble"]
);
f(
  "social-like",
  "Like us",
  "seal",
  "Follow us",
  "Scan to say hi",
  { edge: "scallop", m: "icon:heart" },
  MONO,
  ["badge"]
);
section("business", undefined, ["app", "download", "mobile"], ["url"]);
f(
  "app-phone",
  "App phone",
  "phone",
  "Get the app",
  "Free download",
  { button: true },
  MONO,
  ["phone"]
);
f(
  "app-phone-dark",
  "Dark app phone",
  "phone",
  "Download the app",
  undefined,
  { m: "download" },
  MONO,
  ["phone"]
);
f(
  "app-download",
  "Download",
  "cardBand",
  "Download our app",
  undefined,
  { m: "download", bandTop: true },
  MONO,
  ["download"]
);
f(
  "app-install",
  "Install",
  "landscape",
  "Get the app",
  "Scan to install",
  { m: "phoneScan", codeRight: true },
  MONO,
  ["landscape"]
);
f(
  "app-arrow",
  "App arrow",
  "arrowTag",
  "Get the app",
  "Free on your phone",
  {},
  MONO,
  ["arrow"]
);
section(
  "business",
  undefined,
  ["business card", "contact", "networking"],
  ["vcard"]
);
f(
  "bizcard-light",
  "Business card",
  "bizCard",
  "Scan to save my contact",
  "Nice to meet you",
  {},
  SOFT,
  ["vcard"]
);
f(
  "bizcard-dark",
  "Dark business card",
  "bizCard",
  "Scan to save my contact",
  "Let's keep in touch",
  { dark: true },
  NEON,
  ["vcard", "dark"]
);
f(
  "bizcard-edge",
  "Edge business card",
  "bizCard",
  "Scan to save my contact",
  "Let's work together",
  { edge: true },
  MONO,
  ["vcard"]
);
f(
  "bizcard-hello",
  "Hello card",
  "bizCard",
  "Save my details",
  "Hello",
  { m: "icon:user" },
  SOFT,
  ["vcard"]
);
f(
  "bizcard-portrait",
  "Portrait card",
  "cardPill",
  "Save my contact",
  "Let's connect",
  { m: "icon:user" },
  MONO,
  ["vcard"]
);
f(
  "bizcard-badge",
  "Contact badge",
  "lanyard",
  "Scan to save my contact",
  "Let's connect",
  {},
  MONO,
  ["conference"]
);
section("business", undefined, ["business"], ["url"]);
f(
  "biz-booking",
  "Book online",
  "landscape",
  "Book online",
  "Scan to pick a time",
  { m: "calendarPage", light: true, codeRight: true, bar: true },
  MONO,
  ["booking"],
  ["calcom", "url"]
);
f(
  "biz-hiring",
  "We're hiring",
  "burstCorner",
  "Scan to apply",
  "Hiring",
  { burstInk: "frame" },
  SOFT,
  ["jobs", "hiring"]
);
f(
  "biz-salon",
  "Salon",
  "arch",
  "Scan to book",
  undefined,
  { m: "scissors" },
  MONO,
  ["salon", "booking"],
  ["calcom", "url"]
);
f(
  "biz-repair",
  "Repair shop",
  "cardSolid",
  "Scan to book a repair",
  "Service",
  { m: "gear", mfill: "text" },
  MONO,
  ["repair", "service"]
);
f(
  "biz-support",
  "Support",
  "chatPair",
  "Need help? Scan here",
  "Support",
  { m: "icon:headphones" },
  MONO,
  ["support", "help"]
);
f(
  "biz-launch",
  "Launch",
  "ribbon",
  "Scan to see what's new",
  "Just launched",
  { solid: true, m: "icon:sparkle", fill: "text" },
  MONO,
  ["launch", "announcement"]
);

// Industries and everyday uses (catalogue-industries.mjs)
addIndustryFrames({ section, f });
