// The world collections' frames: holidays and national days from regions
// the first catalogue covered thinly (South and Southeast Asia, East Asia,
// Africa, Latin America, the Middle East, Eastern Europe), awareness days,
// more seasons, and frames for events and public places. Entries use
// catalogue.mjs's f() and section(), so they're described and checked like
// every other generated frame; addWorldFrames() runs at the end of it.
//
// Seasonal frames name an occasion that apps/docs/lib/frames/occasions.ts
// knows the dates of. Labels are short, plain and Latin-1 (the label check
// in tests/support/official-frames.ts), so greetings with letters outside it
// are written the way they're commonly romanized.
export function addWorldFrames(api) {
  holidays(api);
  seasons(api);
  events(api);
  places(api);
}

const pal = (frame, accent, word) => ({
  frame,
  text: "#ffffff",
  accent,
  word,
});

const W = {
  pongal: pal("#8a2d0f", "#f2b632", "terracotta and turmeric"),
  sankranti: pal("#0f4c81", "#f4a62a", "sky blue and marigold"),
  lohri: pal("#7c2d12", "#f59e0b", "ember red and amber"),
  vaisakhi: pal("#1f4d2b", "#e8b931", "field green and wheat gold"),
  onam: pal("#2f5d34", "#f2c94c", "banana-leaf green and gold"),
  kasavu: pal("#6b4f12", "#e9c46a", "kasavu gold"),
  navratri: pal("#8e1b5b", "#f6a400", "magenta and saffron"),
  garba: pal("#0f5e63", "#f59e0b", "teal and amber"),
  durga: pal("#a31621", "#f5d06f", "sindoor red and gold"),
  ganesh: pal("#a63d14", "#f6c443", "vermilion and marigold"),
  rakhi: pal("#9d174d", "#fbbf24", "rose and gold"),
  krishna: pal("#1e3a8a", "#2dd4bf", "indigo and peacock teal"),
  ugadi: pal("#3f6212", "#facc15", "mango-leaf green and yellow"),
  avurudu: pal("#8c3b0c", "#e9b949", "clay and gold"),
  boishakh: pal("#b91c1c", "#fde2e2", "red and white"),
  bangladesh: pal("#006a4e", "#f42a41", "green and red"),
  pakistan: pal("#01411c", "#e8f5ec", "deep green and white"),
  songkran: pal("#0369a1", "#fbbf24", "water blue and yellow"),
  songkranPink: pal("#be185d", "#7dd3fc", "pink and sky blue"),
  krathong: pal("#1e1b4b", "#fbbf24", "night blue and candle gold"),
  vesak: pal("#92400e", "#fde68a", "saffron and pale gold"),
  vesakNight: pal("#172554", "#fcd34d", "night blue and lantern gold"),
  hariRaya: pal("#14532d", "#e9c46a", "green and gold"),
  tabaski: pal("#1e3a8a", "#e0b13a", "indigo and gold"),
  tet: pal("#b91c1c", "#facc15", "red and apricot yellow"),
  seollal: pal("#1e3a8a", "#e11d48", "deep blue and red"),
  singapore: pal("#c8102e", "#ffe4e6", "red and white"),
  midAutumn: pal("#1e293b", "#f2c14e", "night slate and moon gold"),
  midAutumnRed: pal("#7f1d1d", "#f4b942", "lantern red and gold"),
  chuseok: pal("#5b3a1a", "#f2c14e", "chestnut and harvest gold"),
  dragonBoat: pal("#0f5e4f", "#e0b13a", "jade and gold"),
  lanternFest: pal("#a61b29", "#f6c344", "lantern red and gold"),
  tanabata: pal("#1e2a6b", "#f9d65c", "night blue and star yellow"),
  obon: pal("#2e2a4f", "#f08c3a", "indigo and lantern orange"),
  kodomo: pal("#1d4ed8", "#ef4444", "blue and carp red"),
  shogatsu: pal("#14532d", "#c9a227", "pine green and gold"),
  nowruz: pal("#0f766e", "#f6c344", "turquoise and saffron"),
  nowruzSky: pal("#1e40af", "#86efac", "lapis blue and sprout green"),
  yalda: pal("#5b0e1e", "#f2a541", "pomegranate red and amber"),
  hijri: pal("#134e4a", "#d4af37", "deep teal and gold"),
  iftar: pal("#3b2a20", "#e0b84f", "date brown and gold"),
  roshHashanah: pal("#991b1b", "#e9a93a", "crimson and honey"),
  roshHashanahBlue: pal("#1e3a8a", "#e9a93a", "blue and honey"),
  purim: pal("#5b21b6", "#facc15", "purple and yellow"),
  enkutatash: pal("#1f5130", "#f4c20d", "highland green and daisy yellow"),
  kwanzaa: pal("#14532d", "#b91c1c", "green, red and black"),
  kwanzaaRed: pal("#7f1d1d", "#15803d", "red, green and black"),
  juneteenth: pal("#1f2a5c", "#c8102e", "navy and red"),
  africaDay: pal("#14532d", "#facc15", "green and gold"),
  shamElNessim: pal("#0e7490", "#a3e635", "Nile blue and spring green"),
  ghana: pal("#111111", "#fcd116", "black, red, gold and green"),
  nigeria: pal("#0b3d2e", "#008751", "green and white"),
  kenya: pal("#111111", "#bb0000", "black, red and green"),
  southAfrica: pal("#007749", "#ffb612", "green and gold"),
  muertos: pal("#3b0a45", "#f28c28", "deep purple and marigold"),
  muertosPink: pal("#9d174d", "#f59e0b", "magenta and marigold"),
  carnival: pal("#4c1d95", "#facc15", "purple and gold"),
  carnivalSamba: pal("#c2410c", "#22d3ee", "carnival orange and turquoise"),
  reyes: pal("#1e3a8a", "#e0a526", "royal blue and gold"),
  posadas: pal("#9a3412", "#facc15", "terracotta and yellow"),
  junina: pal("#1d4e89", "#f59e0b", "denim blue and orange"),
  inti: pal("#92400e", "#fbbf24", "Andean ochre and sun gold"),
  argentina: pal("#1f4e79", "#74acdf", "sky blue and white"),
  colombia: pal("#003893", "#fcd116", "yellow, blue and red"),
  peru: pal("#9b0c1c", "#d91023", "red and white"),
  chile: pal("#0039a6", "#d52b1e", "blue, white and red"),
  orthodoxEaster: pal("#7f1d1d", "#f4d58d", "Easter red and cream"),
  orthodoxXmas: pal("#5a1a1a", "#d9b45b", "burgundy and gold"),
  maslenitsa: pal("#b45309", "#fde68a", "sun orange and butter yellow"),
  pancake: pal("#78350f", "#fbbf24", "maple brown and butter yellow"),
  germany: pal("#111111", "#dd0000", "black, red and gold"),
  poland: pal("#7f1d1d", "#dc143c", "white and red"),
  ukraine: pal("#0b3a7e", "#ffd700", "blue and yellow"),
  italy: pal("#0b5132", "#cd212a", "green, white and red"),
  kingsDay: pal("#c2410c", "#fed7aa", "orange"),
  belgium: pal("#111111", "#fdda24", "black, yellow and red"),
  indonesia: pal("#9b0f12", "#ce1126", "red and white"),
  womensDay: pal("#5b21b6", "#facc15", "purple and mimosa yellow"),
  earthDay: pal("#14532d", "#38bdf8", "forest green and sky blue"),
  environment: pal("#166534", "#a3e635", "green and lime"),
  waterDay: pal("#075985", "#7dd3fc", "deep blue and water blue"),
  oceanDay: pal("#0c4a6e", "#5eead4", "ocean blue and sea green"),
  bookDay: pal("#3f2a1d", "#e9c46a", "leather brown and gold"),
  yogaDay: pal("#c2410c", "#fed7aa", "saffron and peach"),
  peaceDay: pal("#1d4ed8", "#dbeafe", "peace blue and white"),
  pride: pal("#111111", "#e40303", "black and rainbow"),
  prideViolet: pal("#4c1d95", "#f472b6", "violet and pink"),
  pinkRibbon: pal("#be185d", "#f9a8d4", "pink"),
  redRibbon: pal("#b91c1c", "#fecaca", "red"),
  greenRibbon: pal("#166534", "#86efac", "green"),
  donor: pal("#991b1b", "#fca5a5", "blood red"),
  teachers: pal("#1f3a5f", "#e11d48", "navy and red"),
  kindness: pal("#0f766e", "#fda4af", "teal and pink"),
  foodDay: pal("#365314", "#f59e0b", "olive and amber"),
  // Seasons
  monsoon: pal("#1e3a5f", "#7dd3fc", "rain blue"),
  monsoonGreen: pal("#14532d", "#fde047", "monsoon green and yellow"),
  harvest: pal("#7c4a12", "#e9b949", "harvest brown and gold"),
  harvestRed: pal("#7f1d1d", "#f59e0b", "barn red and amber"),
  sakura: pal("#831843", "#f9a8d4", "plum and blossom pink"),
  sakuraSky: pal("#1e3a8a", "#fbcfe8", "spring blue and blossom pink"),
  summerPool: pal("#0e7490", "#fde047", "pool blue and yellow"),
  summerMelon: pal("#166534", "#fb7185", "rind green and melon pink"),
  winterNight: pal("#1e293b", "#bae6fd", "night slate and ice blue"),
  winterRed: pal("#7f1d1d", "#e2e8f0", "red and snow"),
  springGarden: pal("#365314", "#fcd34d", "garden green and yellow"),
  autumnPlum: pal("#4a1d3a", "#f59e0b", "plum and amber"),
  autumnForest: pal("#3f2a1d", "#d97706", "forest brown and ochre"),
  schoolGreen: pal("#14532d", "#f2b705", "chalkboard green and yellow"),
  chalk: pal("#1f3d2b", "#8b5a2b", "chalkboard green and wood"),
  schoolBlue: pal("#1e3a8a", "#f2b705", "navy and school-bus yellow"),
};

// ════════════════════════════════════════════════════════════════════════════
// Holidays
// ════════════════════════════════════════════════════════════════════════════

function holidays({ f, section, P }) {
  // ── South Asia ──
  section("holidays", "pongal", [
    "pongal",
    "harvest festival",
    "tamil nadu",
    "january",
  ]);
  f(
    "pongal-pot",
    "Pongal pot",
    "cardSolid",
    "Happy Pongal",
    "Scan me",
    { m: "pongalPot", mfill: "accent", mfill2: "text" },
    W.pongal,
    ["pot"]
  );
  f(
    "pongal-sun",
    "Pongal sun seal",
    "seal",
    "Pongalo Pongal",
    "Scan for our greetings",
    { edge: "rosette", m: "sun" },
    W.pongal,
    ["sun"]
  );
  f(
    "pongal-offers",
    "Pongal offers",
    "twoBands",
    "Scan for Pongal offers",
    "Happy Pongal",
    { noteInk: "frame" },
    W.pongal,
    ["sale"]
  );

  section("holidays", "lohri", ["lohri", "punjab", "january"]);
  f(
    "lohri-bonfire",
    "Lohri bonfire",
    "cardSolid",
    "Happy Lohri",
    "Scan me",
    { m: "bonfire", mfill: "accent", mfill2: "text" },
    W.lohri,
    ["bonfire"]
  );
  f(
    "lohri-dhol",
    "Lohri dhol",
    "cardBand",
    "Scan for the party",
    "Happy Lohri",
    { m: "dhol" },
    W.lohri,
    ["dhol", "party"]
  );

  section("holidays", "makar-sankranti", [
    "makar sankranti",
    "uttarayan",
    "kites",
    "january",
  ]);
  f(
    "sankranti-kite",
    "Sankranti kite",
    "cardBand",
    "Happy Makar Sankranti",
    "Scan me",
    { m: "kite" },
    W.sankranti,
    ["kite"]
  );
  f(
    "sankranti-sky",
    "Kites in the sky",
    "scene",
    "Happy Uttarayan",
    "Kite festival",
    {
      m: "kite",
      mx: 300,
      mfill: "accent",
      mfill2: "frame",
      sky: { mix: ["frame", "background"], amount: 0.82 },
    },
    W.sankranti,
    ["kite", "sky"]
  );
  f(
    "sankranti-sticker",
    "Kite sticker",
    "sticker",
    "Happy Sankranti",
    undefined,
    { m: "kite", inner: "background", mfill: "frame" },
    W.sankranti,
    ["kite", "sticker"]
  );

  section("holidays", "vaisakhi", [
    "vaisakhi",
    "baisakhi",
    "harvest festival",
    "april",
  ]);
  f(
    "vaisakhi-wheat",
    "Vaisakhi wheat",
    "arch",
    "Happy Vaisakhi",
    undefined,
    { m: "wheat", solid: true, fill: "accent" },
    W.vaisakhi,
    ["wheat", "harvest"]
  );
  f(
    "vaisakhi-dhol",
    "Baisakhi dhol",
    "cardSolid",
    "Scan for the mela",
    "Happy Baisakhi",
    { m: "dhol", mfill: "accent", mfill2: "text" },
    W.vaisakhi,
    ["dhol", "fair"]
  );
  f(
    "vaisakhi-bands",
    "Vaisakhi bands",
    "twoBands",
    "Scan for the program",
    "Happy Vaisakhi",
    { noteInk: "frame" },
    W.vaisakhi
  );

  section("holidays", "onam", ["onam", "kerala", "harvest festival"]);
  f(
    "onam-pookalam",
    "Pookalam seal",
    "seal",
    "Happy Onam",
    "Scan me",
    { edge: "scallop", m: "pookalam" },
    W.onam,
    ["pookalam", "flowers"]
  );
  f(
    "onam-boat-race",
    "Snake boat race",
    "landscape",
    "Scan for race times",
    "Vallam kali",
    { m: "snakeBoat" },
    W.onam,
    ["boat race"]
  );
  f(
    "onam-sadya",
    "Onam sadya",
    "cardBand",
    "Scan to book your sadya",
    "Happy Onam",
    { m: "leafEco" },
    W.onam,
    ["sadya", "menu"]
  );
  f(
    "onam-kasavu",
    "Kasavu border",
    "doubleLine",
    "Onashamsakal",
    "Happy Onam",
    { m: "pookalam" },
    W.kasavu,
    ["kasavu"]
  );

  section("holidays", "navratri", [
    "navratri",
    "dussehra",
    "durga puja",
    "festival",
  ]);
  f(
    "navratri-dandiya",
    "Dandiya sticks",
    "cardSolid",
    "Happy Navratri",
    "Scan me",
    { m: "dandiya", mfill: "accent", mfill2: "text" },
    W.navratri,
    ["dandiya", "garba"]
  );
  f(
    "navratri-garba-pass",
    "Garba pass",
    "ticketV",
    "Garba night",
    "Scan for your pass",
    { m: "dandiya" },
    W.garba,
    ["garba", "ticket"]
  );
  f(
    "navratri-lamp",
    "Navratri lamp",
    "arch",
    "Shubh Navratri",
    undefined,
    { m: "diya", solid: true, fill: "text" },
    W.navratri,
    ["diya", "lamp"]
  );
  f(
    "durga-puja-lotus",
    "Durga Puja lotus",
    "cardBand",
    "Shubho Pujo",
    "Happy Durga Puja",
    { m: "lotus", bandTop: true },
    W.durga,
    ["durga puja", "lotus"]
  );
  f(
    "dussehra-seal",
    "Dussehra seal",
    "seal",
    "Happy Dussehra",
    "Scan me",
    { edge: "rosette", light: true, m: "marigold" },
    W.durga,
    ["dussehra", "marigold"]
  );

  section("holidays", "ganesh-chaturthi", [
    "ganesh chaturthi",
    "ganeshotsav",
    "festival",
  ]);
  f(
    "ganesh-modak",
    "Modak",
    "cardSolid",
    "Ganpati Bappa Morya",
    "Scan me",
    { m: "modak", mfill: "accent", mfill2: "frame" },
    W.ganesh,
    ["modak", "sweets"]
  );
  f(
    "ganesh-marigold",
    "Ganeshotsav marigold",
    "arch",
    "Happy Ganesh Chaturthi",
    undefined,
    { m: "marigold" },
    W.ganesh,
    ["marigold"]
  );
  f(
    "ganesh-pandal",
    "Pandal sign",
    "hangingSign",
    "Scan for pandal timings",
    undefined,
    {},
    W.ganesh,
    ["pandal"]
  );

  section("holidays", "raksha-bandhan", [
    "raksha bandhan",
    "rakhi",
    "siblings",
  ]);
  f(
    "rakhi-thread",
    "Rakhi",
    "cardBand",
    "Happy Raksha Bandhan",
    "Scan me",
    { m: "rakhi" },
    W.rakhi,
    ["rakhi"]
  );
  f(
    "rakhi-envelope",
    "Rakhi envelope",
    "envelope",
    "Scan to open",
    undefined,
    { m: "rakhi" },
    W.rakhi,
    ["rakhi", "gift"]
  );
  f(
    "rakhi-gift-tag",
    "Rakhi gift tag",
    "hangTag",
    "Scan for your rakhi gift",
    undefined,
    {},
    W.rakhi,
    ["gift"]
  );

  section("holidays", "janmashtami", ["janmashtami", "krishna", "festival"]);
  f(
    "janmashtami-flute",
    "Krishna's flute",
    "cardSolid",
    "Happy Janmashtami",
    "Scan me",
    { m: "flute", mfill: "text", mfill2: "accent" },
    W.krishna,
    ["flute"]
  );
  f(
    "janmashtami-feather",
    "Peacock feather arch",
    "arch",
    "Jai Shri Krishna",
    undefined,
    { m: "peacockFeather", solid: true, fill: "text" },
    W.krishna,
    ["peacock feather"]
  );

  section("holidays", "ugadi", ["ugadi", "gudi padwa", "new year", "spring"]);
  f(
    "gudi-padwa",
    "Gudi",
    "cardSolid",
    "Happy Gudi Padwa",
    "Scan me",
    { m: "gudi", mfill: "text", mfill2: "accent" },
    W.ugadi,
    ["gudi"]
  );
  f(
    "ugadi-leaves",
    "Ugadi mango leaves",
    "arch",
    "Happy Ugadi",
    undefined,
    { m: "branch" },
    W.ugadi,
    ["mango leaves"]
  );

  section("holidays", "republic-day-india", [
    "republic day",
    "india",
    "january 26",
    "national day",
  ]);
  f(
    "republic-day-india",
    "Republic Day seal",
    "seal",
    "Happy Republic Day",
    "Scan me",
    { edge: "rosette", light: true, m: "chakra" },
    P.india,
    ["india"]
  );
  f(
    "republic-day-india-bands",
    "Republic Day bands",
    "twoBands",
    "Scan for the parade",
    "Republic Day",
    { noteInk: "frame" },
    P.india,
    ["india", "parade"]
  );

  section("holidays", "pohela-boishakh", [
    "pohela boishakh",
    "bengali new year",
    "april 14",
  ]);
  f(
    "pohela-boishakh",
    "Noboborsho sun",
    "cardBand",
    "Shubho Noboborsho",
    "Scan me",
    { m: "sun" },
    W.boishakh,
    ["new year", "sun"]
  );
  f(
    "pohela-boishakh-mela",
    "Boishakhi mela",
    "bunting",
    "Scan for the mela",
    undefined,
    {},
    W.boishakh,
    ["fair", "decoration"]
  );

  section("holidays", "bangladesh-independence-day", [
    "independence day",
    "national day",
    "bangladesh",
    "march 26",
  ]);
  f(
    "independence-bangladesh",
    "Bangladesh Independence Day",
    "halfCircle",
    "Happy Independence Day",
    undefined,
    { dark: true },
    W.bangladesh,
    ["bangladesh"]
  );

  section("holidays", "sinhala-tamil-new-year", [
    "sinhala and tamil new year",
    "avurudu",
    "puthandu",
    "april",
  ]);
  f(
    "avurudu-pot",
    "Avurudu milk pot",
    "cardSolid",
    "Happy Avurudu",
    "Scan me",
    { m: "pongalPot", mfill: "text", mfill2: "accent" },
    W.avurudu,
    ["avurudu", "milk rice"]
  );
  f(
    "puthandu-sun",
    "Puthandu sun",
    "circleTop",
    "Scan for our greetings",
    "Happy Puthandu",
    { m: "sun" },
    W.avurudu,
    ["puthandu", "tamil new year"]
  );

  section("holidays", "independence-day", ["independence day", "national day"]);
  f(
    "independence-pakistan",
    "Pakistan Independence Day",
    "circleTop",
    "Happy Independence Day",
    "Pakistan",
    { m: "crescentStar" },
    W.pakistan,
    ["pakistan", "august 14"]
  );
  f(
    "independence-indonesia",
    "Indonesian Independence Day",
    "flagBand",
    "Dirgahayu Indonesia",
    undefined,
    { stripes: ["accent", "background"] },
    W.indonesia,
    ["indonesia", "august 17"]
  );
  f(
    "national-day-singapore",
    "Singapore National Day",
    "cardBand",
    "Happy National Day",
    "Scan for the fireworks",
    { m: "firework" },
    W.singapore,
    ["singapore", "august 9", "fireworks"]
  );
  f(
    "independence-ukraine",
    "Ukrainian Independence Day",
    "flagBand",
    "Happy Independence Day",
    undefined,
    { stripes: ["#0057b7", "accent"] },
    W.ukraine,
    ["ukraine", "august 24"]
  );
  f(
    "independence-argentina",
    "Argentine Independence Day",
    "flagBand",
    "Feliz 9 de Julio",
    undefined,
    {
      stripes: ["accent", "background", "accent"],
      m: "sun",
      msize: 120,
      mfill: "#f6b40e",
      mfill2: "#f6b40e",
    },
    W.argentina,
    ["argentina", "july 9"]
  );
  f(
    "independence-colombia",
    "Colombian Independence Day",
    "flagBand",
    "Feliz 20 de Julio",
    undefined,
    { stripes: ["accent", "accent", "frame", "#ce1126"] },
    W.colombia,
    ["colombia", "july 20"]
  );
  f(
    "independence-peru",
    "Peruvian Independence Day",
    "flagBand",
    "Felices Fiestas Patrias",
    undefined,
    { stripes: ["accent", "background", "accent"], vertical: true },
    W.peru,
    ["peru", "july 28"]
  );
  f(
    "national-day-belgium",
    "Belgian National Day",
    "flagBand",
    "Bonne fête nationale",
    "Scan me",
    { stripes: ["frame", "accent", "#ef3340"], vertical: true },
    W.belgium,
    ["belgium", "july 21"]
  );

  // ── Southeast Asia ──
  section("holidays", "songkran", [
    "songkran",
    "thai new year",
    "water festival",
    "april",
  ]);
  f(
    "songkran-bowl",
    "Songkran bowl",
    "cardSolid",
    "Happy Songkran",
    "Scan me",
    { m: "waterBowl", mfill: "text", mfill2: "accent" },
    W.songkran,
    ["water"]
  );
  f(
    "songkran-drop",
    "Songkran sticker",
    "sticker",
    "Sawasdee Pi Mai",
    undefined,
    { m: "waterDrop", inner: "background", mfill: "frame" },
    W.songkranPink,
    ["water", "sticker"]
  );
  f(
    "songkran-waves",
    "Songkran waves",
    "waveBand",
    "Scan for the map",
    "Happy Songkran",
    { m: "waterBowl" },
    W.songkran,
    ["water", "map"]
  );
  f(
    "songkran-bands",
    "Thai New Year bands",
    "twoBands",
    "Scan for holiday hours",
    "Happy Thai New Year",
    { noteInk: { mix: ["frame", "#000000"], amount: 0.5 } },
    W.songkranPink,
    ["hours"]
  );

  section("holidays", "loy-krathong", [
    "loy krathong",
    "thailand",
    "festival of lights",
    "november",
  ]);
  f(
    "loy-krathong-float",
    "Krathong",
    "cardSolid",
    "Happy Loy Krathong",
    "Scan me",
    { m: "krathong", mfill: "text", mfill2: "accent" },
    W.krathong,
    ["krathong", "river"]
  );
  f(
    "loy-krathong-moon",
    "Full moon river",
    "scene",
    "Scan for the festival",
    "Loy Krathong",
    {
      m: "moonFull",
      mx: 300,
      mfill: "accent",
      sky: "frame",
      skyInk: "text",
      hill1: { mix: ["frame", "background"], amount: 0.3 },
    },
    W.krathong,
    ["moon"]
  );
  f(
    "loy-krathong-program",
    "Loy Krathong program",
    "doubleLine",
    "Scan for the program",
    "Loy Krathong",
    { m: "krathong" },
    W.krathong,
    ["program"]
  );

  section("holidays", "vesak", ["vesak", "wesak", "buddha day", "may"]);
  f(
    "vesak-lantern",
    "Vesak lantern",
    "cardBand",
    "Happy Vesak",
    "Scan me",
    { m: "vesakLantern" },
    W.vesakNight,
    ["lantern"]
  );
  f(
    "vesak-lotus",
    "Vesak lotus arch",
    "arch",
    "Vesak greetings",
    undefined,
    { m: "lotus", solid: true, fill: "accent" },
    W.vesak,
    ["lotus"]
  );
  f(
    "vesak-seal",
    "Wesak seal",
    "seal",
    "Happy Wesak Day",
    "Scan me",
    { edge: "scallop", light: true, m: "lotus" },
    W.vesak,
    ["lotus"]
  );
  f(
    "vesak-candle",
    "Vesak candle",
    "doubleLine",
    "Scan for temple times",
    "Vesak",
    { m: "candle" },
    W.vesakNight,
    ["candle", "temple"]
  );

  section("holidays", "eid-al-fitr", ["eid al-fitr", "eid", "hari raya"]);
  f(
    "hari-raya-ketupat",
    "Ketupat",
    "cardSolid",
    "Selamat Hari Raya",
    "Scan me",
    { m: "ketupat", mfill: "accent", mfill2: "text" },
    W.hariRaya,
    ["ketupat", "aidilfitri"]
  );
  f(
    "hari-raya-open-house",
    "Hari Raya open house",
    "cardBand",
    "Scan for directions",
    "Rumah terbuka",
    { m: "ketupat" },
    W.hariRaya,
    ["open house"]
  );
  f(
    "hari-raya-pelita",
    "Pelita arch",
    "arch",
    "Maaf zahir dan batin",
    undefined,
    { m: "lantern" },
    W.hariRaya,
    ["pelita", "lamp"]
  );

  section("holidays", "eid-al-adha", ["eid al-adha", "eid"]);
  f(
    "hari-raya-haji",
    "Hari Raya Haji",
    "doubleLine",
    "Salam Aidiladha",
    "Selamat Hari Raya Haji",
    { m: "ketupat" },
    W.hariRaya,
    ["aidiladha"]
  );
  f(
    "tabaski",
    "Tabaski",
    "cardBand",
    "Bonne fête de Tabaski",
    "Scan me",
    { m: "crescentStar" },
    W.tabaski,
    ["tabaski", "west africa"]
  );

  section("holidays", "lunar-new-year", ["lunar new year"]);
  f(
    "tet-banh-chung",
    "Banh chung",
    "cardSolid",
    "Happy Tet",
    "Scan me",
    { m: "banhChung", mfill: "accent", mfill2: "text" },
    W.tet,
    ["tet", "vietnam"]
  );
  f(
    "tet-apricot",
    "Apricot blossom",
    "cardBand",
    "Scan for our Tet hours",
    "Happy Tet",
    { m: "blossom", bandTop: true },
    W.tet,
    ["tet", "vietnam", "blossom"]
  );
  f(
    "seollal-knot",
    "Seollal knot",
    "doubleLine",
    "Happy Seollal",
    "Scan me",
    { m: "knot" },
    W.seollal,
    ["seollal", "korea"]
  );

  // ── East Asia ──
  section("holidays", "mid-autumn", [
    "mid-autumn festival",
    "moon festival",
    "mooncakes",
  ]);
  f(
    "mid-autumn-mooncake",
    "Mooncake",
    "cardSolid",
    "Scan to order mooncakes",
    "Mid-Autumn Festival",
    { m: "mooncake", mfill: "accent", mfill2: "frame" },
    W.midAutumn,
    ["mooncake"]
  );
  f(
    "mid-autumn-rabbit",
    "Moon rabbit",
    "arch",
    "Happy Mid-Autumn",
    undefined,
    { m: "rabbit", solid: true, fill: "text", fill2: "accent" },
    W.midAutumn,
    ["rabbit", "moon"]
  );
  f(
    "mid-autumn-lantern-walk",
    "Lantern walk",
    "ticketV",
    "Lantern walk",
    "Scan for the route",
    { m: "lanternRound" },
    W.midAutumnRed,
    ["lantern"]
  );
  f(
    "mid-autumn-seal",
    "Moon seal",
    "seal",
    "Zhongqiu kuaile",
    "Scan me",
    { edge: "rosette", m: "moonFull" },
    W.midAutumn,
    ["moon"]
  );
  f(
    "mid-autumn-gift",
    "Mooncake gift box",
    "giftBox",
    "Scan for gift boxes",
    undefined,
    {},
    W.midAutumnRed,
    ["gift", "mooncake"]
  );

  section("holidays", "chuseok", [
    "chuseok",
    "korean thanksgiving",
    "harvest festival",
  ]);
  f(
    "chuseok-songpyeon",
    "Songpyeon",
    "cardBand",
    "Happy Chuseok",
    "Scan me",
    { m: "songpyeon" },
    W.chuseok,
    ["songpyeon"]
  );
  f(
    "chuseok-moon",
    "Harvest moon hills",
    "scene",
    "Scan for holiday hours",
    "Chuseok",
    { m: "moonFull", mx: 930, mfill: "accent" },
    W.chuseok,
    ["moon", "hours"]
  );
  f(
    "chuseok-gift-tag",
    "Chuseok gift tag",
    "hangTag",
    "Scan for our gift sets",
    undefined,
    {},
    W.chuseok,
    ["gift"]
  );

  section("holidays", "dragon-boat-festival", [
    "dragon boat festival",
    "duanwu",
    "boat race",
  ]);
  f(
    "dragon-boat-race",
    "Dragon boat race",
    "landscape",
    "Scan for race times",
    "Dragon Boat Festival",
    { m: "dragonBoat" },
    W.dragonBoat,
    ["boat race"]
  );
  f(
    "dragon-boat-zongzi",
    "Zongzi",
    "cardSolid",
    "Scan for the menu",
    "Dragon Boat Festival",
    { m: "zongzi", mfill: "accent", mfill2: "frame" },
    W.dragonBoat,
    ["zongzi", "menu"]
  );
  f(
    "dragon-boat-ticket",
    "Race day ticket",
    "ticketH",
    "Scan to enter",
    "Race day",
    { m: "dragonBoat", light: true },
    W.dragonBoat,
    ["ticket"]
  );

  section("holidays", "lantern-festival", [
    "lantern festival",
    "yuanxiao",
    "lanterns",
  ]);
  f(
    "lantern-festival-riddles",
    "Lantern riddles",
    "arch",
    "Scan for the riddles",
    undefined,
    { m: "lanternRound", solid: true, fill: "accent", fill2: "text" },
    W.lanternFest,
    ["riddles", "lantern"]
  );
  f(
    "lantern-festival-tangyuan",
    "Tangyuan bowl",
    "doubleLine",
    "Scan for the menu",
    "Lantern Festival",
    { m: "bowl" },
    W.lanternFest,
    ["tangyuan", "menu"]
  );

  section("holidays", "tanabata", [
    "tanabata",
    "star festival",
    "japan",
    "july 7",
  ]);
  f(
    "tanabata-wishes",
    "Tanabata wishes",
    "cardBand",
    "Scan to make a wish",
    "Tanabata",
    { m: "tanzaku" },
    W.tanabata,
    ["wishes", "bamboo"]
  );
  f(
    "tanabata-stars",
    "Star festival seal",
    "seal",
    "Happy Tanabata",
    "Scan me",
    { edge: "scallop", m: "star5" },
    W.tanabata,
    ["stars"]
  );

  section("holidays", "obon", ["obon", "bon festival", "japan"]);
  f(
    "obon-lantern",
    "Bon lantern",
    "cardSolid",
    "Scan for the Bon dance",
    "Obon",
    { m: "paperLantern", mfill: "accent", mfill2: "text" },
    W.obon,
    ["lantern", "bon odori"]
  );
  f(
    "obon-sign",
    "Bon festival sign",
    "hangingSign",
    "Scan for festival hours",
    undefined,
    {},
    W.obon,
    ["hours"]
  );

  section("holidays", "childrens-day", [
    "children's day",
    "kodomo no hi",
    "may 5",
  ]);
  f(
    "childrens-day-carp",
    "Carp streamers",
    "cardBand",
    "Happy Children's Day",
    "Scan me",
    { m: "koinobori" },
    W.kodomo,
    ["koinobori", "kids"]
  );
  f(
    "childrens-day-sticker",
    "Carp streamer sticker",
    "sticker",
    "Children's Day",
    undefined,
    { m: "koinobori", inner: "background", mfill: "frame", mfill2: "accent" },
    W.kodomo,
    ["kids", "sticker"]
  );

  section("holidays", "new-year", ["new year", "celebration"]);
  f(
    "shogatsu-kadomatsu",
    "Kadomatsu",
    "cardSolid",
    "Happy New Year",
    "Akemashite omedetou",
    { m: "kadomatsu", mfill: "text", mfill2: "accent" },
    W.shogatsu,
    ["japan", "shogatsu"]
  );

  // ── Middle East and Central Asia ──
  section("holidays", "nowruz", ["nowruz", "persian new year", "spring"]);
  f(
    "nowruz-sabzeh",
    "Sabzeh",
    "cardSolid",
    "Nowruz Mobarak",
    "Scan me",
    { m: "sabzeh", mfill: "accent", mfill2: "text" },
    W.nowruz,
    ["sabzeh", "haft-sin"]
  );
  f(
    "nowruz-goldfish",
    "Nowruz goldfish",
    "arch",
    "Happy Nowruz",
    undefined,
    { m: "goldfish", solid: true, fill: "accent", fill2: "text" },
    W.nowruzSky,
    ["goldfish", "haft-sin"]
  );
  f(
    "nowruz-party",
    "Nowruz party ticket",
    "ticketV",
    "Nowruz party",
    "Scan for tickets",
    { m: "sabzeh" },
    W.nowruzSky,
    ["party", "ticket"]
  );
  f(
    "nowruz-seal",
    "Nowruz seal",
    "seal",
    "Happy Nowruz",
    "Scan for our greetings",
    { edge: "rosette", light: true, m: "goldfish" },
    W.nowruz,
    ["goldfish"]
  );

  section("holidays", "yalda", [
    "yalda night",
    "shab-e yalda",
    "winter solstice",
  ]);
  f(
    "yalda-pomegranate",
    "Yalda pomegranate",
    "cardSolid",
    "Shab-e Yalda",
    "Scan me",
    { m: "pomegranate", mfill: "accent", mfill2: "text" },
    W.yalda,
    ["pomegranate"]
  );
  f(
    "yalda-watermelon",
    "Yalda watermelon",
    "arch",
    "Happy Yalda",
    undefined,
    { m: "watermelon", solid: true, fill: "text", fill2: "accent" },
    W.yalda,
    ["watermelon"]
  );
  f(
    "yalda-poem",
    "Hafez reading",
    "doubleLine",
    "Scan for a Hafez poem",
    "Yalda night",
    { m: "pomegranate" },
    W.yalda,
    ["poetry", "hafez"]
  );

  section("holidays", "islamic-new-year", [
    "islamic new year",
    "hijri new year",
    "muharram",
  ]);
  f(
    "hijri-new-year",
    "Hijri New Year",
    "doubleLine",
    "Happy Islamic New Year",
    "Scan me",
    { m: "crescentStar" },
    W.hijri,
    ["crescent"]
  );
  f(
    "hijri-new-year-stamp",
    "Hijri New Year stamp",
    "stamp",
    "Happy Hijri New Year",
    undefined,
    { m: "crescent", light: true },
    W.hijri,
    ["crescent"]
  );

  section("holidays", "ramadan", ["ramadan", "iftar"]);
  f(
    "ramadan-dates",
    "Iftar dates",
    "cardSolid",
    "Iftar is served",
    "Scan for the menu",
    { m: "dates", mfill: "accent", mfill2: "text" },
    W.iftar,
    ["dates", "menu"]
  );
  f(
    "ramadan-suhoor",
    "Suhoor tab",
    "tabTop",
    "Suhoor times",
    "Scan for the timetable",
    { m: "crescent" },
    W.iftar,
    ["suhoor"]
  );

  section("holidays", "rosh-hashanah", [
    "rosh hashanah",
    "jewish new year",
    "shanah tovah",
  ]);
  f(
    "rosh-hashanah-apple",
    "Sweet new year",
    "cardSolid",
    "Shanah Tovah",
    "Scan me",
    { m: "apple", mfill: "text", mfill2: "accent" },
    W.roshHashanah,
    ["apple"]
  );
  f(
    "rosh-hashanah-honey",
    "Honey jar arch",
    "arch",
    "Shanah Tovah Umetukah",
    undefined,
    { m: "honeyJar", solid: true, fill: "accent", fill2: "text" },
    W.roshHashanah,
    ["honey"]
  );
  f(
    "rosh-hashanah-shofar",
    "Shofar",
    "doubleLine",
    "Scan for service times",
    "Rosh Hashanah",
    { m: "shofar" },
    W.roshHashanahBlue,
    ["shofar", "services"]
  );

  section("holidays", "purim", ["purim", "jewish holiday", "costumes"]);
  f(
    "purim-mask",
    "Purim mask",
    "cardBand",
    "Happy Purim",
    "Scan me",
    { m: "mask" },
    W.purim,
    ["mask", "costume"]
  );
  f(
    "purim-pastry",
    "Hamantaschen",
    "arch",
    "Chag Purim Sameach",
    undefined,
    { m: "hamantasch", solid: true, fill: "accent", fill2: "frame" },
    W.purim,
    ["pastry"]
  );

  // ── Africa and the diaspora ──
  section("holidays", "enkutatash", [
    "enkutatash",
    "ethiopian new year",
    "september",
  ]);
  f(
    "enkutatash-daisy",
    "Adey Abeba",
    "cardSolid",
    "Melkam Addis Amet",
    "Scan me",
    { m: "daisy", mfill: "accent", mfill2: "frame" },
    W.enkutatash,
    ["adey abeba", "flowers"]
  );
  f(
    "enkutatash-seal",
    "Ethiopian New Year seal",
    "seal",
    "Happy New Year",
    "Enkutatash",
    { edge: "scallop", light: true, m: "daisy" },
    W.enkutatash,
    ["flowers"]
  );

  section("holidays", "kwanzaa", ["kwanzaa", "december", "celebration"]);
  f(
    "kwanzaa-kinara",
    "Kinara",
    "cardSolid",
    "Happy Kwanzaa",
    "Scan me",
    { m: "kinara", mfill: "text", mfill2: "accent" },
    W.kwanzaa,
    ["kinara", "candles"]
  );
  f(
    "kwanzaa-harvest",
    "First fruits",
    "arch",
    "Scan for the program",
    undefined,
    { m: "harvestBasket" },
    W.kwanzaaRed,
    ["harvest", "program"]
  );
  f(
    "kwanzaa-bands",
    "Kwanzaa colors",
    "flagBand",
    "Happy Kwanzaa",
    undefined,
    { stripes: ["#b91c1c", "#111111", "#15803d"] },
    W.kwanzaaRed,
    ["colors"]
  );

  section("holidays", "juneteenth", ["juneteenth", "june 19", "freedom"]);
  f(
    "juneteenth-star",
    "Juneteenth star",
    "cardSolid",
    "Happy Juneteenth",
    "Scan me",
    { m: "nova", mfill: "text", mfill2: "accent" },
    W.juneteenth,
    ["star"]
  );
  f(
    "juneteenth-seal",
    "Juneteenth seal",
    "seal",
    "Juneteenth",
    "Scan for events",
    { edge: "rosette", light: true, m: "nova" },
    W.juneteenth,
    ["events"]
  );

  section("holidays", "africa-day", ["africa day", "may 25"]);
  f(
    "africa-day",
    "Africa Day",
    "cardBand",
    "Happy Africa Day",
    "Scan me",
    { m: "globe" },
    W.africaDay,
    ["africa"]
  );

  section("holidays", "sham-el-nessim", ["sham el-nessim", "egypt", "spring"]);
  f(
    "sham-el-nessim",
    "Sham el-Nessim egg",
    "cardSolid",
    "Happy Sham el-Nessim",
    "Scan me",
    { m: "egg", mfill: "accent", mfill2: "text" },
    W.shamElNessim,
    ["egg", "picnic"]
  );

  section("holidays", "ghana-independence-day", [
    "independence day",
    "national day",
    "ghana",
    "march 6",
  ]);
  f(
    "independence-ghana",
    "Ghana Independence Day",
    "flagBand",
    "Happy Independence Day",
    undefined,
    {
      stripes: ["#ce1126", "accent", "#006b3f"],
      m: "star5",
      msize: 90,
      mfill: "#111111",
      mfill2: "#111111",
    },
    W.ghana,
    ["ghana"]
  );

  section("holidays", "nigeria-independence-day", [
    "independence day",
    "national day",
    "nigeria",
    "october 1",
  ]);
  f(
    "independence-nigeria",
    "Nigeria Independence Day",
    "flagBand",
    "Happy Independence Day",
    undefined,
    { stripes: ["accent", "background", "accent"], vertical: true },
    W.nigeria,
    ["nigeria"]
  );

  section("holidays", "jamhuri-day", [
    "jamhuri day",
    "kenya",
    "december 12",
    "national day",
  ]);
  f(
    "jamhuri-day",
    "Jamhuri Day",
    "flagBand",
    "Happy Jamhuri Day",
    undefined,
    { stripes: ["#111111", "background", "accent", "background", "#006600"] },
    W.kenya,
    ["kenya"]
  );

  section("holidays", "freedom-day-south-africa", [
    "freedom day",
    "south africa",
    "april 27",
    "national day",
  ]);
  f(
    "freedom-day-south-africa",
    "Freedom Day",
    "cardBand",
    "Happy Freedom Day",
    "South Africa",
    { m: "dove" },
    W.southAfrica,
    ["south africa", "dove"]
  );

  // ── Latin America ──
  section("holidays", "day-of-the-dead", [
    "day of the dead",
    "dia de muertos",
    "mexico",
    "november",
  ]);
  f(
    "muertos-marigold",
    "Cempasúchil",
    "cardSolid",
    "Día de Muertos",
    "Scan me",
    { m: "marigold", mfill: "accent", mfill2: "text" },
    W.muertos,
    ["marigold"]
  );
  f(
    "muertos-papel-picado",
    "Papel picado",
    "cardBand",
    "Scan for the program",
    "Día de Muertos",
    { m: "papelPicado" },
    W.muertosPink,
    ["papel picado"]
  );
  f(
    "muertos-pan",
    "Pan de muerto",
    "arch",
    "Order pan de muerto",
    undefined,
    { m: "panDeMuerto", solid: true, fill: "accent", fill2: "text" },
    W.muertos,
    ["bread", "bakery"]
  );
  f(
    "muertos-ofrenda",
    "Ofrenda candle",
    "doubleLine",
    "Scan to share a memory",
    "Ofrenda",
    { m: "candle" },
    W.muertos,
    ["ofrenda", "candle"]
  );
  f(
    "muertos-seal",
    "Día de Muertos seal",
    "seal",
    "Feliz Día de Muertos",
    "Scan me",
    { edge: "scallop", light: true, m: "marigold" },
    W.muertosPink,
    ["marigold"]
  );

  section("holidays", "carnival", ["carnival", "mardi gras", "parade"]);
  f(
    "carnival-mask",
    "Carnival mask",
    "cardSolid",
    "Scan for the parade map",
    "Happy Carnival",
    { m: "mask", mfill: "accent", mfill2: "text" },
    W.carnival,
    ["mask", "parade"]
  );
  f(
    "carnival-plume",
    "Carnival plumes",
    "arch",
    "Bom Carnaval",
    undefined,
    { m: "plume", solid: true, fill: "accent", fill2: "text" },
    W.carnivalSamba,
    ["feathers", "samba"]
  );
  f(
    "mardi-gras-seal",
    "Mardi Gras seal",
    "seal",
    "Happy Mardi Gras",
    "Scan me",
    { edge: "rosette", m: "plume" },
    W.carnival,
    ["mardi gras"]
  );
  f(
    "carnival-pass",
    "Carnival pass",
    "ticketV",
    "Carnival pass",
    "Scan at the gate",
    { m: "mask" },
    W.carnivalSamba,
    ["ticket"]
  );

  section("holidays", "three-kings-day", [
    "three kings day",
    "dia de reyes",
    "epiphany",
    "january 6",
  ]);
  f(
    "reyes-rosca",
    "Rosca de reyes",
    "cardSolid",
    "Feliz Día de Reyes",
    "Scan me",
    { m: "rosca", mfill: "accent", mfill2: "text" },
    W.reyes,
    ["rosca", "bakery"]
  );
  f(
    "reyes-crown",
    "Three kings crown",
    "arch",
    "Scan to order your rosca",
    undefined,
    { m: "crown", solid: true, fill: "accent", fill2: "text" },
    W.reyes,
    ["crown", "bakery"]
  );

  section("holidays", "las-posadas", ["las posadas", "mexico", "december"]);
  f(
    "posadas-pinata",
    "Posada piñata",
    "cardBand",
    "Las Posadas",
    "Scan for the schedule",
    { m: "pinata" },
    W.posadas,
    ["pinata"]
  );
  f(
    "posadas-candle",
    "Posada candle",
    "arch",
    "Join the procession",
    undefined,
    { m: "candle", solid: true, fill: "accent", fill2: "text" },
    W.posadas,
    ["candle", "procession"]
  );

  section("holidays", "festa-junina", ["festa junina", "brazil", "june"]);
  f(
    "festa-junina-flags",
    "Bandeirinhas",
    "bunting",
    "Scan for the arraial",
    undefined,
    {},
    W.junina,
    ["flags", "decoration"]
  );
  f(
    "festa-junina-bonfire",
    "Festa Junina bonfire",
    "cardSolid",
    "Festa Junina",
    "Scan me",
    { m: "bonfire", mfill: "accent", mfill2: "text" },
    W.junina,
    ["bonfire"]
  );
  f(
    "festa-junina-corn",
    "Festa Junina corn",
    "arch",
    "Scan for the menu",
    undefined,
    { m: "corn", solid: true, fill: "accent", fill2: "text" },
    W.junina,
    ["corn", "menu"]
  );

  section("holidays", "inti-raymi", [
    "inti raymi",
    "peru",
    "festival of the sun",
    "june 24",
  ]);
  f(
    "inti-raymi-sun",
    "Inti Raymi sun",
    "seal",
    "Inti Raymi",
    "Scan for the festival",
    { edge: "rosette", m: "sun" },
    W.inti,
    ["sun"]
  );

  section("holidays", "fiestas-patrias-chile", [
    "fiestas patrias",
    "chile",
    "september 18",
    "national day",
  ]);
  f(
    "fiestas-patrias-chile",
    "Fiestas Patrias star",
    "cardSolid",
    "¡Viva Chile!",
    "Felices Fiestas Patrias",
    { m: "star5", mfill: "text" },
    W.chile,
    ["chile"]
  );

  // ── Europe ──
  section("holidays", "orthodox-easter", [
    "orthodox easter",
    "pascha",
    "easter",
  ]);
  f(
    "orthodox-easter-pysanka",
    "Painted egg",
    "cardSolid",
    "Christos Anesti",
    "Scan me",
    { m: "pysanka", mfill: "text", mfill2: "accent" },
    W.orthodoxEaster,
    ["egg", "greece"]
  );
  f(
    "orthodox-easter-arch",
    "Pascha egg arch",
    "arch",
    "Hristos a înviat",
    undefined,
    { m: "pysanka", solid: true, fill: "accent", fill2: "frame" },
    W.orthodoxEaster,
    ["egg", "romania"]
  );
  f(
    "orthodox-easter-seal",
    "Pascha seal",
    "seal",
    "Happy Easter",
    "Scan for the service",
    { edge: "scallop", light: true, m: "pysanka" },
    W.orthodoxXmas,
    ["egg", "service"]
  );

  section("holidays", "orthodox-christmas", [
    "orthodox christmas",
    "january 7",
    "christmas",
  ]);
  f(
    "orthodox-christmas-star",
    "First star",
    "cardSolid",
    "Merry Christmas",
    "January 7",
    { m: "northStar", mfill: "accent", mfill2: "text" },
    W.orthodoxXmas,
    ["star"]
  );
  f(
    "orthodox-christmas-candle",
    "Christmas Eve candle",
    "arch",
    "Scan for the service",
    undefined,
    { m: "candle", solid: true, fill: "accent", fill2: "text" },
    W.orthodoxXmas,
    ["candle", "service"]
  );

  section("holidays", "maslenitsa", ["maslenitsa", "pancake week", "spring"]);
  f(
    "maslenitsa-pancakes",
    "Blini stack",
    "cardSolid",
    "Maslenitsa",
    "Scan for the menu",
    { m: "pancakes", mfill: "text", mfill2: "accent" },
    W.maslenitsa,
    ["blini", "menu"]
  );
  f(
    "maslenitsa-sun",
    "Maslenitsa sun",
    "seal",
    "Happy Maslenitsa",
    "Scan me",
    { edge: "rosette", m: "sun" },
    W.maslenitsa,
    ["sun"]
  );

  section("holidays", "pancake-day", ["pancake day", "shrove tuesday"]);
  f(
    "pancake-day",
    "Pancake Day",
    "cardBand",
    "Scan for the toppings",
    "Pancake Day",
    { m: "pancakes" },
    W.pancake,
    ["pancakes", "menu"]
  );

  section("holidays", "german-unity-day", [
    "german unity day",
    "germany",
    "october 3",
    "national day",
  ]);
  f(
    "german-unity-day",
    "German Unity Day",
    "flagBand",
    "Tag der Einheit",
    undefined,
    { stripes: ["#111111", "accent", "#ffce00"] },
    W.germany,
    ["germany"]
  );

  section("holidays", "poland-independence-day", [
    "independence day",
    "poland",
    "november 11",
    "national day",
  ]);
  f(
    "independence-poland",
    "Polish Independence Day",
    "flagBand",
    "Happy Independence Day",
    undefined,
    { stripes: ["background", "accent"] },
    W.poland,
    ["poland"]
  );

  section("holidays", "festa-della-repubblica", [
    "festa della repubblica",
    "italy",
    "june 2",
    "national day",
  ]);
  f(
    "festa-della-repubblica",
    "Festa della Repubblica",
    "flagBand",
    "Festa della Repubblica",
    undefined,
    { stripes: ["#009246", "background", "accent"], vertical: true },
    W.italy,
    ["italy"]
  );

  section("holidays", "kings-day", [
    "king's day",
    "koningsdag",
    "netherlands",
    "april 27",
  ]);
  f(
    "kings-day-crown",
    "Koningsdag crown",
    "cardSolid",
    "Fijne Koningsdag",
    "Scan me",
    { m: "crown", mfill: "text", mfill2: "accent" },
    W.kingsDay,
    ["crown", "orange"]
  );

  // ── Awareness days and months ──
  section("holidays", "womens-day", ["international women's day", "march 8"]);
  f(
    "womens-day-mimosa",
    "Mimosa sprig",
    "cardSolid",
    "Happy Women's Day",
    "Scan me",
    { m: "mimosa", mfill: "text", mfill2: "accent" },
    W.womensDay,
    ["mimosa", "flowers"]
  );
  f(
    "womens-day-seal",
    "Women's Day seal",
    "seal",
    "Happy Women's Day",
    "March 8",
    { edge: "scallop", light: true, m: "mimosa" },
    W.womensDay,
    ["flowers"]
  );

  section("holidays", "earth-day", ["earth day", "environment", "april 22"]);
  f(
    "earth-day-globe",
    "Earth Day globe",
    "cardSolid",
    "Happy Earth Day",
    "Scan me",
    { m: "globe", mfill: "text", mfill2: "accent" },
    W.earthDay,
    ["globe"]
  );
  f(
    "earth-day-pledge",
    "Green pledge",
    "arch",
    "Take the green pledge",
    undefined,
    { m: "sprout", solid: true, fill: "accent", fill2: "text" },
    W.earthDay,
    ["pledge", "sustainability"]
  );
  f(
    "earth-day-recycle",
    "Recycling tips",
    "cardBand",
    "Scan for recycling tips",
    "Earth Day",
    { m: "recycle" },
    W.environment,
    ["recycling"]
  );

  section("holidays", "environment-day", [
    "world environment day",
    "environment",
    "june 5",
  ]);
  f(
    "environment-day",
    "Environment Day sticker",
    "sticker",
    "World Environment Day",
    undefined,
    { m: "leafEco", inner: "background", mfill: "frame" },
    W.environment,
    ["leaf", "sticker"]
  );

  section("holidays", "world-water-day", [
    "world water day",
    "water",
    "march 22",
  ]);
  f(
    "water-day-drop",
    "Water drop",
    "cardSolid",
    "World Water Day",
    "Scan to save water",
    { m: "waterDrop", mfill: "accent", mfill2: "text" },
    W.waterDay,
    ["water"]
  );

  section("holidays", "world-ocean-day", [
    "world ocean day",
    "ocean",
    "june 8",
  ]);
  f(
    "ocean-day-waves",
    "Ocean waves",
    "cardBand",
    "Protect our oceans",
    "World Ocean Day",
    { m: "waves" },
    W.oceanDay,
    ["ocean", "waves"]
  );

  section("holidays", "world-book-day", [
    "world book day",
    "reading",
    "april 23",
  ]);
  f(
    "book-day-arch",
    "Book Day arch",
    "arch",
    "Happy World Book Day",
    undefined,
    { m: "book", solid: true, fill: "accent", fill2: "text" },
    W.bookDay,
    ["books", "reading"]
  );
  f(
    "book-day-list",
    "Reading list",
    "cardBand",
    "Scan for a reading list",
    "World Book Day",
    { m: "books" },
    W.bookDay,
    ["books", "reading list"]
  );

  section("holidays", "yoga-day", [
    "international day of yoga",
    "yoga",
    "june 21",
  ]);
  f(
    "yoga-day-lotus",
    "Yoga Day lotus",
    "cardSolid",
    "Scan for class times",
    "International Yoga Day",
    { m: "lotus", mfill: "text", mfill2: "accent" },
    W.yogaDay,
    ["yoga", "lotus"]
  );

  section("holidays", "peace-day", [
    "international day of peace",
    "peace",
    "september 21",
  ]);
  f(
    "peace-day-dove",
    "Peace dove",
    "arch",
    "International Peace Day",
    undefined,
    { m: "dove", solid: true, fill: "text" },
    W.peaceDay,
    ["dove", "peace"]
  );

  section("holidays", "pride", ["pride", "pride month", "lgbtq", "june"]);
  f(
    "pride-flag",
    "Pride flag",
    "flagBand",
    "Happy Pride",
    undefined,
    {
      stripes: [
        "#e40303",
        "#ff8c00",
        "#ffed00",
        "#008026",
        "#004dff",
        "#750787",
      ],
    },
    W.pride,
    ["rainbow", "flag"]
  );
  f(
    "pride-rainbow",
    "Pride rainbow",
    "cardSolid",
    "Love is love",
    "Happy Pride",
    { m: "rainbow", mfill: "text", mfill2: "accent" },
    W.prideViolet,
    ["rainbow"]
  );
  f(
    "pride-heart",
    "Pride heart sticker",
    "sticker",
    "Proud ally",
    undefined,
    { m: "heart", inner: "background", mfill: "accent" },
    W.prideViolet,
    ["heart", "ally"]
  );

  section("holidays", "breast-cancer-awareness", [
    "breast cancer awareness",
    "pink ribbon",
    "october",
  ]);
  f(
    "pink-ribbon",
    "Pink ribbon",
    "cardSolid",
    "Scan to book a screening",
    "Breast Cancer Awareness",
    { m: "ribbonLoop", mfill: "accent" },
    W.pinkRibbon,
    ["ribbon", "awareness"]
  );
  f(
    "pink-ribbon-seal",
    "Pink ribbon seal",
    "seal",
    "Think pink",
    "Breast Cancer Awareness",
    { edge: "scallop", light: true, m: "ribbonLoop" },
    W.pinkRibbon,
    ["ribbon", "awareness"]
  );

  section("holidays", "world-aids-day", [
    "world aids day",
    "red ribbon",
    "december 1",
  ]);
  f(
    "red-ribbon",
    "Red ribbon",
    "arch",
    "World AIDS Day",
    undefined,
    { m: "ribbonLoop", solid: true, fill: "text" },
    W.redRibbon,
    ["ribbon", "awareness"]
  );

  section("holidays", "mental-health-day", [
    "world mental health day",
    "mental health",
    "october 10",
  ]);
  f(
    "green-ribbon",
    "Green ribbon",
    "doubleLine",
    "Scan for support",
    "World Mental Health Day",
    { m: "ribbonLoop" },
    W.greenRibbon,
    ["ribbon", "support"]
  );

  section("holidays", "blood-donor-day", [
    "world blood donor day",
    "blood donation",
    "june 14",
  ]);
  f(
    "blood-donor-drop",
    "Blood Donor Day drop",
    "cardSolid",
    "Give blood",
    "Scan to book a donation",
    { m: "donorDrop", mfill: "accent", mfill2: "frame" },
    W.donor,
    ["blood", "donation"]
  );
  f(
    "blood-donor-sticker",
    "Blood donor sticker",
    "sticker",
    "I gave blood",
    undefined,
    {
      m: "donorDrop",
      inner: "background",
      mfill: "frame",
      mfill2: "background",
    },
    W.donor,
    ["blood", "sticker"]
  );

  section("holidays", "teachers-day", [
    "world teachers' day",
    "teachers",
    "october 5",
  ]);
  f(
    "teachers-day-apple",
    "Teachers' Day card",
    "cardSolid",
    "Happy Teachers' Day",
    "Scan me",
    { m: "apple", mfill: "accent", mfill2: "text" },
    W.teachers,
    ["apple", "school"]
  );
  f(
    "teachers-day-note",
    "Thank you, teacher",
    "cardPill",
    "Thank a teacher",
    "World Teachers' Day",
    { m: "book" },
    W.teachers,
    ["thank you"]
  );

  section("holidays", "kindness-day", [
    "world kindness day",
    "kindness",
    "november 13",
  ]);
  f(
    "kindness-day",
    "Kindness heart",
    "cardPill",
    "Pass it on",
    "World Kindness Day",
    { m: "hearts" },
    W.kindness,
    ["kindness", "heart"]
  );

  section("holidays", "world-food-day", [
    "world food day",
    "food",
    "october 16",
  ]);
  f(
    "food-day-wheat",
    "Food Day wheat",
    "cardBand",
    "Scan to share a meal",
    "World Food Day",
    { m: "wheat" },
    W.foodDay,
    ["food", "wheat"]
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Seasons
// ════════════════════════════════════════════════════════════════════════════

function seasons({ f, section }) {
  section("seasons", "monsoon", ["monsoon", "rainy season", "rain"]);
  f(
    "monsoon-umbrella",
    "Monsoon umbrella",
    "cardSolid",
    "Hello monsoon",
    "Scan me",
    { m: "rainUmbrella", mfill: "accent", mfill2: "text" },
    W.monsoon,
    ["umbrella"]
  );
  f(
    "monsoon-cloud",
    "Rain cloud",
    "cardBand",
    "Rainy day offers",
    "Scan me",
    { m: "rainCloud" },
    W.monsoon,
    ["cloud", "sale"]
  );
  f(
    "monsoon-paper-boat",
    "Paper boat",
    "arch",
    "Monsoon is here",
    undefined,
    { m: "paperBoat", solid: true, fill: "text", fill2: "accent" },
    W.monsoonGreen,
    ["paper boat"]
  );
  f(
    "monsoon-boots",
    "Rain boots sticker",
    "sticker",
    "Rainy day",
    undefined,
    { m: "rainBoots", inner: "background", mfill: "frame", mfill2: "accent" },
    W.monsoonGreen,
    ["boots", "sticker"]
  );
  f(
    "monsoon-chai",
    "Monsoon chai",
    "cupShape",
    "Chai and pakoras",
    undefined,
    { sleeveInk: "frame" },
    W.monsoon,
    ["chai", "cafe"]
  );

  section("seasons", "harvest", ["harvest", "farm", "autumn"]);
  f(
    "harvest-basket",
    "Harvest basket",
    "cardSolid",
    "Harvest season",
    "Scan for the farm shop",
    { m: "harvestBasket", mfill: "accent", mfill2: "text" },
    W.harvest,
    ["farm shop"]
  );
  f(
    "harvest-hay",
    "Hay bale",
    "landscape",
    "Pick your own",
    "Scan for opening times",
    { m: "hayBale" },
    W.harvestRed,
    ["farm", "pick your own"]
  );
  f(
    "harvest-corn",
    "Harvest corn",
    "cardBand",
    "Harvest festival",
    "Scan me",
    { m: "corn" },
    W.harvest,
    ["corn", "festival"]
  );
  f(
    "harvest-market",
    "Harvest market stall",
    "awning",
    "Scan for the harvest",
    undefined,
    {},
    W.harvestRed,
    ["market"]
  );

  section("seasons", "cherry-blossom", [
    "cherry blossom",
    "hanami",
    "sakura",
    "spring",
  ]);
  f(
    "hanami-sakura",
    "Sakura",
    "cardSolid",
    "Hanami",
    "Scan for the bloom map",
    { m: "sakura", mfill: "accent", mfill2: "text" },
    W.sakura,
    ["sakura", "map"]
  );
  f(
    "hanami-arch",
    "Blossom season arch",
    "arch",
    "Cherry blossom season",
    undefined,
    { m: "sakura", solid: true, fill: "accent", fill2: "frame" },
    W.sakuraSky,
    ["sakura"]
  );
  f(
    "hanami-picnic",
    "Hanami picnic",
    "ticketV",
    "Hanami picnic",
    "Scan to RSVP",
    { m: "sakura" },
    W.sakura,
    ["picnic", "rsvp"]
  );

  section("seasons", "summer", ["summer", "sun"]);
  f(
    "summer-sunglasses",
    "Sunglasses",
    "cardBand",
    "Scan for summer hours",
    "Hello sunshine",
    { m: "sunglasses" },
    W.summerPool,
    ["sunglasses", "hours"]
  );
  f(
    "summer-watermelon",
    "Watermelon sticker",
    "sticker",
    "One in a melon",
    undefined,
    { m: "watermelon", inner: "background", mfill: "frame", mfill2: "accent" },
    W.summerMelon,
    ["watermelon", "sticker"]
  );
  f(
    "summer-camp",
    "Summer camp",
    "scene",
    "Scan to sign up",
    "Summer camp",
    { m: "sun", mx: 300, mfill: "accent", hill1: "accent" },
    W.summerMelon,
    ["camp", "kids"]
  );
  f(
    "summer-reading",
    "Summer reading",
    "cardSolid",
    "Summer reading list",
    "Scan for the list",
    { m: "books", mfill: "text", mfill2: "accent" },
    W.summerPool,
    ["books", "library"]
  );
  f(
    "summer-pool",
    "Pool rules",
    "circleTop",
    "Scan for pool rules",
    "Pool is open",
    { m: "lifebuoy" },
    W.summerPool,
    ["pool", "rules", "safety"]
  );

  section("seasons", "winter", ["winter", "snow"]);
  f(
    "winter-snowman",
    "Snowman",
    "cardSolid",
    "Snow day",
    "Scan for closures",
    { m: "snowman", mfill: "text", mfill2: "accent" },
    W.winterNight,
    ["snowman", "closures"]
  );
  f(
    "winter-skating",
    "Skating rink",
    "arch",
    "Scan for session times",
    undefined,
    { m: "iceSkate", solid: true, fill: "text", fill2: "accent" },
    W.winterNight,
    ["skating", "rink"]
  );
  f(
    "winter-lift-pass",
    "Lift pass",
    "ticketV",
    "Lift pass",
    "Scan for lift status",
    { m: "skis" },
    W.winterRed,
    ["ski", "ticket"]
  );
  f(
    "winter-sale",
    "Winter sale bands",
    "twoBands",
    "Scan for the winter sale",
    "Winter sale",
    { noteInk: "frame" },
    W.winterRed,
    ["sale"]
  );

  section("seasons", "spring", ["spring", "garden"]);
  f(
    "spring-watering-can",
    "Watering can",
    "cardBand",
    "Scan for planting tips",
    "Spring planting",
    { m: "wateringCan" },
    W.springGarden,
    ["garden", "planting"]
  );
  f(
    "spring-cleaning",
    "Spring cleaning",
    "cardPill",
    "Get the checklist",
    "Spring cleaning",
    { m: "icon:sparkle" },
    W.springGarden,
    ["cleaning"]
  );
  f(
    "spring-showers",
    "Spring showers",
    "arch",
    "April showers",
    undefined,
    { m: "rainBoots", solid: true, fill: "text", fill2: "accent" },
    W.sakuraSky,
    ["rain", "boots"]
  );

  section("seasons", "autumn", ["autumn", "fall"]);
  f(
    "autumn-apple-picking",
    "Orchard picking",
    "cardSolid",
    "Fruit picking",
    "Scan for orchard hours",
    { m: "apple", mfill: "accent", mfill2: "text" },
    W.autumnForest,
    ["apples", "orchard"]
  );
  f(
    "autumn-mushroom",
    "Forest walk",
    "arch",
    "Scan for the trail map",
    undefined,
    { m: "mushroom", solid: true, fill: "accent", fill2: "text" },
    W.autumnForest,
    ["mushroom", "walk"]
  );
  f(
    "autumn-pumpkin-patch",
    "Pumpkin patch",
    "landscape",
    "Pumpkin patch",
    "Scan for tickets",
    { m: "pumpkinTall" },
    W.autumnPlum,
    ["pumpkins", "farm"]
  );

  section("seasons", "back-to-school", ["back to school", "school"]);
  f(
    "school-backpack",
    "Backpack",
    "cardSolid",
    "Ready for school",
    "Scan for first-day info",
    { m: "backpack", mfill: "accent", mfill2: "frame" },
    W.schoolBlue,
    ["backpack"]
  );
  f(
    "school-bus-routes",
    "School bus",
    "landscape",
    "Scan for bus routes",
    "Back to school",
    { m: "schoolBus" },
    W.schoolBlue,
    ["bus", "routes"]
  );
  f(
    "school-welcome-apple",
    "Welcome back arch",
    "arch",
    "Welcome back",
    undefined,
    { m: "apple", solid: true, fill: "accent", fill2: "text" },
    W.schoolGreen,
    ["apple", "welcome"]
  );
  f(
    "school-lunch-menu",
    "School lunch menu",
    "chalkboard",
    "Scan for the lunch menu",
    "This week",
    {},
    W.chalk,
    ["lunch", "menu"]
  );
  f(
    "school-uniform",
    "Uniform shop",
    "cardBand",
    "Scan for uniform sizes",
    "Back to school",
    { m: "shirt" },
    W.schoolGreen,
    ["uniform"]
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Events
// ════════════════════════════════════════════════════════════════════════════

function events({ f, section, MONO, SOFT, NEON, GREY }) {
  section("events", undefined, ["graduation", "events"], ["url"]);
  f(
    "event-grad-seal",
    "Graduation seal",
    "seal",
    "Congrats, grad",
    "Scan for the photos",
    { edge: "rosette", light: true, m: "mortarboard" },
    MONO,
    ["photos"]
  );
  f(
    "event-grad-diploma",
    "Diploma ribbon",
    "ribbon",
    "Scan for the ceremony",
    "Graduation day",
    { m: "diploma", solid: true },
    SOFT,
    ["ceremony"]
  );

  f(
    "event-grad-party",
    "Grad party",
    "cardPill",
    "Scan to RSVP",
    "Grad party",
    { m: "mortarboard" },
    MONO,
    ["party", "rsvp"]
  );
  f(
    "event-grad-stream",
    "Graduation stream",
    "landscape",
    "Watch the ceremony",
    "Scan to stream it live",
    { m: "diploma", light: true, bar: true },
    MONO,
    ["livestream"]
  );

  section("events", undefined, ["conference", "events"], ["url"]);
  f(
    "event-keynote",
    "Keynote speaker",
    "cardSolid",
    "Scan for the speakers",
    "Keynote",
    { m: "lectern", mfill2: "text" },
    MONO,
    ["speaker"]
  );
  f(
    "event-speaker-qa",
    "Speaker Q&A",
    "chatPair",
    "Ask the speaker",
    "Questions? Send them in",
    { m: "quiz" },
    MONO,
    ["questions"]
  );
  f(
    "event-session-feedback",
    "Session feedback",
    "cardPill",
    "Rate this session",
    "Tell us how it went",
    { m: "icon:star", tintBg: true },
    MONO,
    ["feedback"]
  );
  f(
    "event-slides",
    "Slides download",
    "arrowCurl",
    "Get the slides",
    "Scan to download",
    { tintBg: true },
    MONO,
    ["slides", "download"]
  );
  f(
    "event-booth",
    "Exhibitor booth",
    "tabTop",
    "Visit our booth",
    "Scan for a demo",
    { m: "laptop" },
    SOFT,
    ["trade show", "booth"]
  );
  f(
    "event-workshop",
    "Workshop handout",
    "stitched",
    "Scan for the workbook",
    "Workshop",
    { m: "lightbulb", light: true },
    MONO,
    ["workshop", "class"]
  );
  f(
    "event-hackathon",
    "Hackathon",
    "neon",
    "Join the hackathon",
    undefined,
    { m: "laptop" },
    NEON,
    ["hackathon", "tech"]
  );
  f(
    "event-meetup",
    "Meetup bubble",
    "bubbleTop",
    "Meetup tonight",
    "Scan for the details",
    { round: true },
    MONO,
    ["meetup", "networking"]
  );

  section("events", undefined, ["music", "events"], ["url"]);
  f(
    "event-setlist",
    "Setlist",
    "arch",
    "Scan for the setlist",
    undefined,
    { m: "guitar" },
    MONO,
    ["concert", "setlist"]
  );
  f(
    "event-tour-merch",
    "Tour merch",
    "priceTag",
    "Scan to shop merch",
    undefined,
    {},
    MONO,
    ["concert", "merch"]
  );
  f(
    "event-open-mic",
    "Open mic",
    "circleTop",
    "Sign up to perform",
    "Open mic night",
    { m: "mic" },
    MONO,
    ["open mic", "sign up"]
  );

  section("events", undefined, ["festival", "events"], ["url"]);
  f(
    "event-film-festival",
    "Film festival pass",
    "ticketV",
    "Scan for screenings",
    "Film festival",
    { m: "popcorn", light: true },
    MONO,
    ["film", "cinema"]
  );
  f(
    "event-short-films",
    "Short films",
    "cardBand",
    "Scan for the schedule",
    "Short film night",
    { m: "clapper" },
    MONO,
    ["film", "schedule"]
  );
  f(
    "event-book-fair",
    "Book fair",
    "ribbon",
    "Scan for the author list",
    "Book fair",
    { m: "books" },
    MONO,
    ["books", "authors"]
  );

  f(
    "event-craft-fair",
    "Craft fair",
    "stamp",
    "Meet the makers",
    "Craft fair",
    { m: "yarn", light: true },
    MONO,
    ["crafts", "market"]
  );
  f(
    "event-night-market",
    "Night market",
    "waveBand",
    "Scan for the stalls",
    "Night market",
    { m: "stringLights" },
    MONO,
    ["market", "food"]
  );
  f(
    "event-food-festival",
    "Food festival",
    "awning",
    "Scan for the food map",
    undefined,
    {},
    SOFT,
    ["food", "map"]
  );

  section("events", undefined, ["birthday", "party", "events"], ["url"]);
  f(
    "event-cupcake",
    "Cupcake sticker",
    "sticker",
    "Make a wish",
    undefined,
    { m: "cupcake", inner: "background", mfill2: "frame" },
    MONO,
    ["cupcake"]
  );
  f(
    "event-party-hat",
    "Party hat",
    "cardSolid",
    "Join the celebration",
    "It's my birthday",
    { m: "partyHat", mfill2: "text" },
    MONO,
    ["rsvp"]
  );
  f(
    "event-guest-book",
    "Guest book",
    "doubleLine",
    "Sign the guest book",
    "Leave us a message",
    { m: "icon:heart", tintBg: true },
    MONO,
    ["guest book", "messages"]
  );
  f(
    "event-milestone",
    "Milestone birthday",
    "seal",
    "Milestone birthday",
    "Scan for the party",
    { edge: "scallop", m: "starBadge" },
    MONO,
    ["milestone"]
  );

  section("events", undefined, ["baby shower", "baby", "events"], ["url"]);
  f(
    "event-baby-shower",
    "Baby shower",
    "arch",
    "Baby shower RSVP",
    undefined,
    { m: "pram" },
    MONO,
    ["rsvp"]
  );
  f(
    "event-baby-gifts",
    "Baby gift list",
    "cardBand",
    "Scan for the gift list",
    "Baby on the way",
    { m: "onesie" },
    MONO,
    ["registry", "gifts"]
  );
  f(
    "event-birth-announcement",
    "Birth announcement",
    "envelope",
    "Meet our baby",
    undefined,
    { m: "babyBottle", light: true },
    MONO,
    ["announcement", "newborn"]
  );

  section("events", undefined, ["quinceanera", "party", "events"], ["url"]);
  f(
    "event-quince",
    "Quinceañera tiara",
    "arch",
    "Celebrate my XV",
    undefined,
    { m: "tiara" },
    MONO,
    ["mis xv", "rsvp"]
  );

  section("events", undefined, ["sports", "match day", "events"], ["url"]);
  f(
    "event-match-lineup",
    "Match lineup",
    "shield",
    "Scan for the lineup",
    undefined,
    { m: "soccerBall", ctaInk: "frame" },
    GREY,
    ["soccer", "lineup"]
  );
  f(
    "event-season-ticket",
    "Season ticket",
    "ticketV",
    "Season ticket",
    "Scan for the fixtures",
    { m: "whistle" },
    MONO,
    ["tickets", "fixtures"]
  );
  f(
    "event-tournament",
    "Tournament draw",
    "tabTop",
    "Tournament draw",
    "Scan for the brackets",
    { m: "trophy" },
    SOFT,
    ["tournament", "brackets"]
  );

  section("events", undefined, ["charity run", "running", "events"], ["url"]);
  f(
    "event-fun-run",
    "Fun run route",
    "cardBand",
    "Scan for the route",
    "Fun run",
    { m: "sneaker", bandTop: true },
    MONO,
    ["route", "map"]
  );
  f(
    "event-runner-tracker",
    "Runner tracker",
    "phone",
    "Cheer me on",
    "Scan to follow my run",
    { m: "stopwatch", light: true },
    MONO,
    ["tracking"]
  );

  section("events", undefined, ["games", "events"], ["url"]);
  f(
    "event-trivia",
    "Trivia night",
    "bubbleFrame",
    "Join the quiz",
    "Trivia night",
    { m: "quiz", tail: "right" },
    MONO,
    ["trivia", "quiz"]
  );
  f(
    "event-game-night",
    "Game night ticket",
    "ticketH",
    "Save your seat",
    "Game night",
    { m: "dice" },
    MONO,
    ["board games"]
  );

  section("events", undefined, ["gala", "events"], ["url"]);
  f(
    "event-gala",
    "Gala auction",
    "doubleLine",
    "Scan for the auction",
    "Gala dinner",
    { m: "bowtie" },
    MONO,
    ["auction", "dinner"]
  );
  f(
    "event-awards",
    "Awards night",
    "laurel",
    "Scan for the winners",
    "Awards",
    {},
    MONO,
    ["awards", "winners"]
  );
  f(
    "event-prom",
    "Prom night",
    "neon",
    "Prom night tickets",
    undefined,
    { m: "discoBall" },
    NEON,
    ["prom", "dance"]
  );
  f(
    "event-talent-show",
    "Talent show vote",
    "burstCorner",
    "Vote for your favorite",
    "Talent show",
    {},
    MONO,
    ["talent show", "vote"]
  );

  section("events", undefined, ["celebration", "events"], ["url"]);
  f(
    "event-retirement",
    "Retirement send-off",
    "rules",
    "Happy retirement",
    "Scan for the send-off",
    { m: "hourglass" },
    MONO,
    ["retirement"]
  );
  f(
    "event-anniversary",
    "Anniversary",
    "seal",
    "Happy anniversary",
    "Scan to see the photos",
    { light: true, m: "hearts" },
    MONO,
    ["anniversary", "photos"]
  );
  f(
    "event-engagement",
    "Engagement party",
    "cardBand",
    "Scan to RSVP",
    "We're engaged",
    { m: "engagementRing", tintBg: true },
    MONO,
    ["engagement", "rsvp"]
  );
  f(
    "event-reunion",
    "Reunion weekend",
    "underline",
    "Reunion weekend",
    "Scan for the schedule",
    { border: true },
    MONO,
    ["reunion", "schedule"]
  );
  f(
    "event-memorial",
    "In memory",
    "doubleLine",
    "Share a memory",
    "In loving memory",
    { m: "candle", tintBg: true },
    MONO,
    ["memorial", "memories"]
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Places
// ════════════════════════════════════════════════════════════════════════════

function places({ f, section, MONO, SOFT, NEON, GREY }) {
  section("places", undefined, ["museum", "culture"], ["url"]);
  f(
    "museum-exhibit-label",
    "Exhibit label",
    "sideBar",
    "Scan for the story",
    "About this piece",
    { m: "amphora" },
    MONO,
    ["exhibit"]
  );
  f(
    "museum-gallery-map",
    "Gallery map",
    "cardBand",
    "Scan for the gallery map",
    undefined,
    { m: "pictureFrame", bandTop: true },
    MONO,
    ["gallery", "map"]
  );
  f(
    "museum-ticket",
    "Museum ticket",
    "ticketV",
    "Scan for tickets",
    "Museum entry",
    { m: "column", light: true },
    MONO,
    ["tickets"]
  );
  f(
    "museum-artist-note",
    "Artist note",
    "doubleLine",
    "About the artist",
    "Scan to read more",
    { m: "pictureFrame", tintBg: true },
    MONO,
    ["gallery", "art"]
  );
  f(
    "historic-marker",
    "Historic marker",
    "seal",
    "Historic site",
    "Scan for its history",
    { edge: "rosette", m: "column" },
    MONO,
    ["history", "heritage"]
  );

  section("places", undefined, ["library", "books"], ["url"]);
  f(
    "library-catalog",
    "Library catalog",
    "browser",
    "Search the catalog",
    "Library catalog",
    {},
    MONO,
    ["catalog"]
  );

  f(
    "library-ebooks",
    "Library e-books",
    "phone",
    "Borrow e-books",
    "Use your library card",
    { m: "book", light: true },
    MONO,
    ["e-books"]
  );
  f(
    "library-hours",
    "Library hours",
    "hangingSign",
    "Scan for library hours",
    undefined,
    {},
    MONO,
    ["opening hours"]
  );

  section("places", undefined, ["transit", "travel"], ["url"]);
  f(
    "transit-bus-arrivals",
    "Bus arrivals",
    "cardBand",
    "Live bus times",
    "Scan at this stop",
    { m: "bus" },
    MONO,
    ["bus", "timetable"]
  );
  f(
    "transit-train-timetable",
    "Train timetable",
    "tabTop",
    "Train timetable",
    "Scan for departures",
    { m: "train" },
    SOFT,
    ["train", "timetable"]
  );
  f(
    "transit-next-trains",
    "Next trains",
    "twoBands",
    "Next trains",
    "Scan for live departures",
    {},
    MONO,
    ["train", "platform"]
  );
  f(
    "transit-ferry",
    "Ferry sailings",
    "waveBand",
    "Ferry times",
    "Scan for sailings",
    { m: "ferry" },
    MONO,
    ["ferry", "timetable"]
  );
  f(
    "transit-bike-share",
    "Bike share",
    "circleTop",
    "Unlock a bike",
    "Scan to ride",
    { m: "bicycle" },
    MONO,
    ["bike", "rental"]
  );
  f(
    "transit-report",
    "Report a transit issue",
    "bubbleFrame",
    "Report an issue",
    "Help us fix it fast",
    { m: "train", light: true, tail: "center" },
    MONO,
    ["report", "feedback"]
  );
  f(
    "transit-fare",
    "Transit fare",
    "ticketH",
    "Buy a ticket",
    "Scan to pay your fare",
    { m: "bus", light: true },
    MONO,
    ["tickets", "fare"]
  );

  // Cars & parking is catalogue-industries.mjs's collection
  section("automotive", undefined, ["parking"], ["url"]);
  f(
    "parking-find-car",
    "Find my car",
    "arrowTag",
    "Find your car",
    "Scan to save your spot",
    {},
    MONO,
    ["car park"]
  );

  section("places", undefined, ["park", "outdoors"], ["url"]);
  f(
    "park-map",
    "Park map",
    "scene",
    "Scan for the park map",
    "Welcome to the park",
    { m: "parkTree", mx: 960 },
    MONO,
    ["map"]
  );
  f(
    "park-dog-rules",
    "Dog park rules",
    "circleTop",
    "Dog park",
    "Scan for the rules",
    { m: "paw" },
    MONO,
    ["dogs", "rules"]
  );
  f(
    "park-playground",
    "Playground",
    "arch",
    "Playground rules",
    undefined,
    { m: "swing" },
    MONO,
    ["playground", "kids"]
  );
  f(
    "park-report",
    "Park issue report",
    "chatPair",
    "Report a problem",
    "Broken bench? Tell us",
    { m: "parkTree" },
    MONO,
    ["report", "feedback"]
  );
  f(
    "park-bench-walks",
    "Park bench walks",
    "stitched",
    "Scan for local walks",
    "Take a seat",
    { m: "bench", light: true },
    MONO,
    ["walks"]
  );
  f(
    "garden-plant-label",
    "Plant label",
    "tabTop",
    "Plant guide",
    "Scan for plant facts",
    { m: "cactus" },
    SOFT,
    ["botanical garden", "plants"]
  );

  section("places", undefined, ["beach", "outdoors"], ["url"]);
  f(
    "beach-conditions",
    "Beach conditions",
    "cardBand",
    "Beach conditions",
    "Scan before you swim",
    { m: "lifebuoy" },
    SOFT,
    ["safety", "weather"]
  );
  f(
    "beach-lifeguard",
    "Lifeguard station",
    "shield",
    "Lifeguard info",
    undefined,
    { m: "lifebuoy", ctaInk: "frame" },
    GREY,
    ["lifeguard", "safety"]
  );
  f(
    "beach-info-sticker",
    "Beach info sticker",
    "sticker",
    "Beach info",
    undefined,
    { m: "parasol", inner: "background" },
    MONO,
    ["information"]
  );

  section("places", undefined, ["campsite", "outdoors"], ["url"]);
  f(
    "camp-check-in",
    "Campsite check-in",
    "cardSolid",
    "Campsite check-in",
    "Scan when you arrive",
    { m: "tent", mfill2: "text" },
    MONO,
    ["check in", "camping"]
  );
  f(
    "camp-map",
    "Campground map",
    "landscape",
    "Campground map",
    "Scan to find your pitch",
    { m: "tent", light: true },
    MONO,
    ["map", "camping"]
  );
  f(
    "camp-fire-rules",
    "Campfire rules",
    "rules",
    "Campfire rules",
    "Scan before you light up",
    { border: true, m: "bonfire" },
    MONO,
    ["safety", "camping"]
  );

  section("places", undefined, ["coworking", "office"], ["url"]);
  f(
    "cowork-desk",
    "Desk booking",
    "landscape",
    "Book a desk",
    "Scan to reserve",
    { m: "laptop" },
    MONO,
    ["booking", "desk"]
  );
  f(
    "cowork-meeting-room",
    "Meeting room booking",
    "sideBar",
    "Book this room",
    "Meeting room",
    { m: "icon:calendar", tintBg: true },
    MONO,
    ["booking", "meeting room"]
  );

  section("places", undefined, ["hostel", "hospitality"], ["url"]);
  f(
    "hostel-check-in",
    "Hostel check-in",
    "cardBand",
    "Scan to check in",
    "Welcome to the hostel",
    { m: "bunkBed" },
    MONO,
    ["check in"]
  );
  f(
    "hostel-house-rules",
    "Hostel house rules",
    "stitched",
    "House rules",
    "Quiet hours and more",
    { m: "bunkBed" },
    MONO,
    ["rules"]
  );
  f(
    "hostel-local-tips",
    "Local tips",
    "bubbleTop",
    "Local tips",
    "Our favorite spots",
    { tailX: 300, tailSkew: 40 },
    MONO,
    ["recommendations"]
  );

  section("places", undefined, ["visitor center", "tourism"], ["url"]);
  f(
    "visitor-info",
    "Visitor information",
    "tabBottom",
    "Visitor information",
    "What's nearby",
    { wide: true },
    MONO,
    ["information"]
  );

  f(
    "visitor-wildlife",
    "Wildlife guide",
    "arch",
    "Wildlife guide",
    undefined,
    { m: "binoculars" },
    MONO,
    ["wildlife", "nature"]
  );

  f(
    "visitor-town-map",
    "Town map",
    "cardPill",
    "Get the town map",
    "Scan to explore",
    { m: "foldedMap" },
    MONO,
    ["map"]
  );
  f(
    "marina-welcome",
    "Marina welcome",
    "seal",
    "Welcome to the marina",
    "Scan for berth info",
    { edge: "scallop", light: true, m: "anchor" },
    MONO,
    ["marina", "boats"]
  );

  section("places", undefined, ["zoo", "aquarium", "animals"], ["url"]);
  f(
    "zoo-animal-facts",
    "Zoo animal facts",
    "sideBar",
    "Scan for animal facts",
    "Meet our residents",
    { m: "elephant", tintBg: true },
    MONO,
    ["zoo"]
  );
  f(
    "aquarium-feeding",
    "Aquarium feeding times",
    "cardBand",
    "Scan for feeding times",
    "Aquarium",
    { m: "angelfish", bandTop: true },
    MONO,
    ["aquarium"]
  );

  section("places", undefined, ["wifi"], ["wifi"]);
  f(
    "wifi-cafe-cup",
    "Cafe Wi-Fi cup",
    "cupShape",
    "Scan for Wi-Fi",
    undefined,
    {},
    MONO,
    ["cafe"]
  );
  f(
    "wifi-reception",
    "Reception Wi-Fi",
    "doubleLine",
    "Guest Wi-Fi",
    "Welcome, visitors",
    { m: "icon:wifi" },
    MONO,
    ["office", "guests"]
  );
  f(
    "wifi-rental",
    "Holiday rental Wi-Fi",
    "house",
    "Wi-Fi for your stay",
    undefined,
    { light: true, m: "icon:wifi" },
    MONO,
    ["rental", "guests"]
  );
  f(
    "wifi-waiting-room",
    "Waiting room Wi-Fi",
    "cardPill",
    "Wi-Fi while you wait",
    "Scan to connect",
    { m: "icon:wifi", tintBg: true },
    MONO,
    ["waiting room"]
  );
  f(
    "wifi-library",
    "Library Wi-Fi",
    "stamp",
    "Library Wi-Fi",
    "Scan to connect",
    { m: "books", light: true },
    MONO,
    ["library"]
  );
  f(
    "wifi-venue",
    "Venue Wi-Fi",
    "neon",
    "Event Wi-Fi",
    undefined,
    { m: "icon:wifi" },
    NEON,
    ["events", "venue"]
  );
  f(
    "wifi-hostel-board",
    "Hostel Wi-Fi board",
    "chalkboard",
    "Scan for Wi-Fi",
    "Hostel guests",
    {},
    GREY,
    ["hostel"]
  );
  f(
    "wifi-cowork",
    "Coworking Wi-Fi",
    "halfCircle",
    "Member Wi-Fi",
    undefined,
    { dark: true },
    SOFT,
    ["coworking"]
  );
}
