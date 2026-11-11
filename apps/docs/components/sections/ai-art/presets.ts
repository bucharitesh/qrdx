// Style presets for AI QR art. Each prompt is the scene the model repaints the
// QR code as (lib/ai/art-image.ts adds the scan rules): concrete scenes,
// light and texture words, no text in the image. No artists' names, brands
// or real people.
//
// Every preset has a preview at public/images/ai-art-styles/<id>.webp, made
// on the real pipeline by scripts/ai/art-previews.ts and kept only when it
// scans (pipeline gate, zbarimg and a "Great" in-browser scan score). Add a
// preset here, run that script with --missing, and update
// AI_ART_PRESET_COUNT in ./preset-meta.ts.
//
// This module is the whole catalogue (every prompt), so client code loads it
// lazily (./load-presets.ts) and never imports it directly: the playground's
// first load stays the same size however many presets there are.

import type { AIArtCategory } from "./preset-meta";

export {
  AI_ART_CATEGORIES,
  type AIArtCategory,
} from "./preset-meta";

export interface AIArtPreset {
  id: string;
  name: string;
  category: AIArtCategory;
  /** Extra words the picker's search matches, besides the name and category */
  tags: readonly string[];
  prompt: string;
  /** Things to keep out of the image, filled in when this preset is picked. */
  negativePrompt?: string;
  /** CSS background behind the preview while it loads. */
  swatch?: string;
}

/**
 * The picker's first tab, in order: broad styles whose previews read well,
 * across the categories. Curated by hand: there's no per-style usage data
 * yet. Within each category below, the broadest styles come first too.
 */
export const AI_ART_FEATURED_PRESET_IDS: readonly string[] = [
  "coral-reef",
  "cozy-cats",
  "mediterranean-town",
  "oil-painting",
  "synthwave",
  "stained-glass",
  "lighthouse",
  "red-fox",
  "sunflowers",
  "pop-art",
  "sunken-city",
  "strawberries",
];

export const AI_ART_PRESETS: AIArtPreset[] = [
  // Nature
  {
    id: "coral-reef",
    name: "Coral reef",
    category: "nature",
    tags: ["ocean", "underwater", "fish", "tropical", "blue"],
    prompt:
      "a vibrant underwater coral reef with tropical fish and sea turtles, sun rays through clear turquoise water, highly detailed",
    swatch: "linear-gradient(135deg, #22d3ee 0%, #0e7490 50%, #fb7185 100%)",
  },
  {
    id: "sunflowers",
    name: "Sunflowers",
    category: "nature",
    tags: ["flowers", "yellow", "summer", "field"],
    prompt:
      "a field of tall golden sunflowers facing the sun under a deep blue summer sky, vivid yellow petals, crisp detail",
  },
  {
    id: "autumn-forest",
    name: "Autumn forest",
    category: "nature",
    tags: ["fall", "trees", "leaves", "orange", "woods"],
    prompt:
      "an enchanted autumn forest with golden and red leaves, a winding path, soft fog and sunbeams, highly detailed",
    swatch: "linear-gradient(135deg, #fde68a 0%, #ea580c 55%, #7f1d1d 100%)",
  },
  {
    id: "desert-dunes",
    name: "Desert dunes",
    category: "nature",
    tags: ["sand", "sahara", "sunset", "warm", "aerial"],
    prompt:
      "rolling sand dunes in the sahara at sunset, long shadows, rippled sand texture, warm orange light, aerial photography",
    swatch: "linear-gradient(135deg, #fed7aa 0%, #f59e0b 50%, #9a3412 100%)",
  },
  {
    id: "maple-leaves",
    name: "Maple leaves",
    category: "nature",
    tags: ["autumn", "leaves", "red", "japan"],
    prompt:
      "a close-up canopy of glowing red and orange japanese maple leaves backlit by the autumn sun, rich color",
  },
  {
    id: "lavender-fields",
    name: "Lavender fields",
    category: "nature",
    tags: ["purple", "flowers", "provence", "summer"],
    prompt:
      "endless rows of blooming lavender in provence at golden hour, a lone tree on the horizon, warm soft light, landscape photography",
  },
  {
    id: "tulip-fields",
    name: "Tulip fields",
    category: "nature",
    tags: ["flowers", "spring", "netherlands", "colorful"],
    prompt:
      "colorful stripes of tulip fields in red, pink, yellow and white under a blue spring sky, a windmill in the distance, crisp detail",
  },
  {
    id: "wildflower-meadow",
    name: "Wildflower meadow",
    category: "nature",
    tags: ["flowers", "spring", "bees", "field", "pastel"],
    prompt:
      "a dense wildflower meadow with poppies, daisies and lavender, bees, soft bokeh, spring morning, macro photography",
    swatch: "linear-gradient(135deg, #fecaca 0%, #c4b5fd 50%, #4d7c0f 100%)",
  },
  {
    id: "zen-garden",
    name: "Zen garden",
    category: "nature",
    tags: ["japanese", "garden", "koi", "calm", "green"],
    prompt:
      "a serene japanese zen garden with a koi pond, cherry blossoms, stone lanterns and moss, soft morning light, highly detailed, photorealistic",
    swatch: "linear-gradient(135deg, #f9a8d4 0%, #86efac 55%, #166534 100%)",
  },
  {
    id: "lotus-pond",
    name: "Lotus pond",
    category: "nature",
    tags: ["lotus", "flowers", "water", "pink", "calm"],
    prompt:
      "pink lotus flowers and round green leaves floating on a still pond, soft morning mist, gentle reflections, serene, photorealistic",
  },
  {
    id: "succulents",
    name: "Succulents",
    category: "nature",
    tags: ["plants", "cactus", "garden", "pastel", "green"],
    prompt:
      "a top-down view of a dense succulent garden with rosettes in sage green, dusty pink and lilac, soft natural light, botanical photography",
  },
  {
    id: "mountain-lake",
    name: "Mountain lake",
    category: "nature",
    tags: ["alpine", "lake", "snow", "landscape", "reflection"],
    prompt:
      "a crystal clear alpine lake surrounded by snowy peaks and pine trees, mirror reflections, golden hour, landscape photography",
    swatch: "linear-gradient(135deg, #e0f2fe 0%, #38bdf8 45%, #14532d 100%)",
  },
  {
    id: "northern-lights",
    name: "Northern lights",
    category: "nature",
    tags: ["aurora", "night", "sky", "snow", "stars"],
    prompt:
      "aurora borealis over a frozen lake and snowy forest at night, green and purple sky, stars, long exposure photography",
    swatch: "linear-gradient(135deg, #0f172a 0%, #10b981 50%, #a855f7 100%)",
  },
  // Animals
  {
    id: "cozy-cats",
    name: "Cozy cats",
    category: "animals",
    tags: ["cats", "kittens", "pets", "cozy"],
    prompt:
      "two fluffy cats curled up on a knitted blanket by a sunny window with potted plants, warm soft light, cozy, photorealistic",
  },
  {
    id: "puppies",
    name: "Puppies",
    category: "animals",
    tags: ["dogs", "puppies", "pets", "cute"],
    prompt:
      "a wicker basket of golden retriever puppies in a spring garden, soft fur, flowers, gentle sunlight, adorable",
  },
  {
    id: "red-fox",
    name: "Red fox",
    category: "animals",
    tags: ["fox", "winter", "snow", "wildlife"],
    prompt:
      "a red fox in a snowy meadow at golden hour, fluffy winter coat, soft backlight, wildlife photography",
  },
  {
    id: "parrots",
    name: "Tropical parrots",
    category: "animals",
    tags: ["birds", "parrots", "tropical", "colorful"],
    prompt:
      "scarlet macaws and colorful parrots perched among tropical leaves and flowers, vivid red, blue and yellow, jungle light",
  },
  {
    id: "hummingbirds",
    name: "Hummingbirds",
    category: "animals",
    tags: ["birds", "flowers", "tropical", "colorful"],
    prompt:
      "iridescent hummingbirds hovering around red and orange tropical flowers, shimmering feathers, soft green background, highly detailed",
  },
  {
    id: "highland-cow",
    name: "Highland cow",
    category: "animals",
    tags: ["cow", "scotland", "farm", "cute"],
    prompt:
      "a shaggy ginger highland cow standing in purple heather on a misty hillside, soft light, highly detailed",
  },
  {
    id: "koi-pond",
    name: "Koi pond",
    category: "animals",
    tags: ["fish", "koi", "japan", "pond", "orange"],
    prompt:
      "orange, white and black koi fish swimming in a clear green pond with lily pads, top-down view, rich color",
  },
  {
    id: "peacock-feathers",
    name: "Peacock feathers",
    category: "animals",
    tags: ["feathers", "peacock", "teal", "iridescent"],
    prompt:
      "a close-up of peacock feathers with shimmering eyes in teal, emerald and gold, rich iridescent detail",
  },
  {
    id: "panda",
    name: "Panda",
    category: "animals",
    tags: ["panda", "bamboo", "china", "cute"],
    prompt:
      "a giant panda eating bamboo in a misty green forest, soft fur, gentle light, wildlife photography",
  },
  {
    id: "snowy-owl",
    name: "Snowy owl",
    category: "animals",
    tags: ["owl", "birds", "winter", "white"],
    prompt:
      "a snowy owl with white feathers perched on a frosted branch in a winter forest, soft falling snow, wildlife photography",
  },
  {
    id: "hedgehog",
    name: "Hedgehog",
    category: "animals",
    tags: ["cute", "autumn", "woodland"],
    prompt:
      "a tiny hedgehog among red and orange autumn leaves and mushrooms, soft warm light, adorable, macro photography",
  },
  {
    id: "flamingos",
    name: "Flamingos",
    category: "animals",
    tags: ["birds", "pink", "lagoon", "tropical"],
    prompt:
      "a flock of pink flamingos wading in a turquoise lagoon, crisp reflections, clear bright morning light, rich color",
  },
  {
    id: "honeybees",
    name: "Honeybees",
    category: "animals",
    tags: ["bees", "honey", "gold", "summer"],
    prompt:
      "honeybees on golden honeycomb dripping with honey, warm glowing amber light, macro photography",
  },
  {
    id: "tiger",
    name: "Tiger",
    category: "animals",
    tags: ["big cat", "jungle", "orange", "wildlife"],
    prompt:
      "a bengal tiger resting among lush green jungle leaves, vivid orange and black stripes, dappled sunlight, wildlife photography",
  },
  {
    id: "penguins",
    name: "Penguins",
    category: "animals",
    tags: ["penguins", "antarctica", "ice", "birds"],
    prompt:
      "a colony of penguins on blue icebergs and snow, crisp polar light, clear sky, wildlife photography",
  },
  // Places
  {
    id: "mediterranean-town",
    name: "Mediterranean town",
    category: "places",
    tags: ["greece", "sea", "summer", "white", "blue"],
    prompt:
      "white houses with blue domes on a cliff above the aegean sea, bougainvillea, bright summer sun, travel photography",
    swatch: "linear-gradient(135deg, #ffffff 0%, #60a5fa 50%, #1e3a8a 100%)",
  },
  {
    id: "paris-rooftops",
    name: "Paris rooftops",
    category: "places",
    tags: ["france", "city", "europe", "rooftops", "morning"],
    prompt:
      "parisian zinc rooftops and chimneys at sunrise, a soft pink sky over the old city, wrought iron balconies, travel photography",
  },
  {
    id: "alpine-village",
    name: "Alpine village",
    category: "places",
    tags: ["mountains", "snow", "cozy", "village", "winter"],
    prompt:
      "a cozy alpine village in snowy mountains at dusk, warm glowing windows, pine forest, cinematic lighting, highly detailed",
    swatch: "linear-gradient(135deg, #e0f2fe 0%, #64748b 55%, #f59e0b 100%)",
  },
  {
    id: "marrakech-souk",
    name: "Marrakech souk",
    category: "places",
    tags: ["morocco", "market", "lanterns", "warm"],
    prompt:
      "a moroccan souk with hanging brass lanterns, stacked rugs, spice cones and woven baskets, warm light through a slatted roof, vibrant",
    negativePrompt: "people",
  },
  {
    id: "cliffside-village",
    name: "Cliffside village",
    category: "places",
    tags: ["italy", "coast", "colorful", "sea", "summer"],
    prompt:
      "colorful houses stacked on a cliff above a small harbor on the italian riviera, fishing boats, turquoise sea, summer light",
  },
  {
    id: "lisbon-tram",
    name: "Lisbon tram",
    category: "places",
    tags: ["portugal", "tram", "street", "yellow"],
    prompt:
      "a yellow vintage tram climbing a steep cobbled street in lisbon, tiled facades and terracotta roofs, bright sunny afternoon",
    negativePrompt: "people",
  },
  {
    id: "aerial-farmland",
    name: "Aerial farmland",
    category: "places",
    tags: ["drone", "fields", "aerial", "green", "countryside"],
    prompt:
      "aerial view of patchwork farmland in soft greens and golds, hedgerows, a few trees and a winding river, drone photography, gentle evening light",
    swatch: "linear-gradient(135deg, #bef264 0%, #65a30d 45%, #a16207 100%)",
  },
  {
    id: "havana-street",
    name: "Havana street",
    category: "places",
    tags: ["cuba", "colorful", "vintage", "car"],
    prompt:
      "a sunny street in old havana with pastel colonial facades, wooden shutters and a vintage convertible car, warm caribbean light",
    negativePrompt: "people, logos",
  },
  {
    id: "venice-canals",
    name: "Venice canals",
    category: "places",
    tags: ["italy", "water", "boats", "europe"],
    prompt:
      "a quiet venetian canal with gondolas, pastel palazzi and small arched bridges, reflections on green water, warm afternoon light",
    negativePrompt: "people",
  },
  {
    id: "tokyo-alley",
    name: "Tokyo alley",
    category: "places",
    tags: ["japan", "night", "lanterns", "street"],
    prompt:
      "a narrow tokyo alley at night with paper lanterns, small izakaya shopfronts and wet cobblestones, cinematic, highly detailed",
    swatch: "linear-gradient(135deg, #1f2937 0%, #dc2626 50%, #fbbf24 100%)",
  },
  {
    id: "city-skyline",
    name: "City skyline",
    category: "places",
    tags: ["new york", "skyscrapers", "city", "evening"],
    prompt:
      "a dense skyline of skyscrapers at blue hour with glowing windows and a river reflecting the lights, crisp architectural photography",
  },
  {
    id: "neon-city",
    name: "Neon city",
    category: "places",
    tags: ["cyberpunk", "night", "neon", "rain", "futuristic"],
    prompt:
      "a futuristic cyberpunk city street at night, neon signs, rain reflections on the pavement, cinematic, ultra detailed",
    swatch: "linear-gradient(135deg, #0f172a 0%, #7c3aed 50%, #ec4899 100%)",
  },
  // Architecture
  {
    id: "lighthouse",
    name: "Lighthouse",
    category: "architecture",
    tags: ["lighthouse", "coast", "sea", "red"],
    prompt:
      "a red and white striped lighthouse on a rocky green headland above a deep blue sea, bright summer sky, crisp detail",
  },
  {
    id: "painted-townhouses",
    name: "Painted townhouses",
    category: "architecture",
    tags: ["colorful", "houses", "street", "pastel"],
    prompt:
      "a row of brightly painted victorian townhouses in pink, mint, yellow and sky blue on a sunny hillside street, crisp daylight",
    negativePrompt: "people",
  },
  {
    id: "onion-domes",
    name: "Onion domes",
    category: "architecture",
    tags: ["domes", "colorful", "cathedral", "winter"],
    prompt:
      "colorful striped and swirled onion domes of an old cathedral in red, green, blue and gold against a clear winter sky",
  },
  {
    id: "pagoda-temple",
    name: "Pagoda temple",
    category: "architecture",
    tags: ["japan", "kyoto", "temple", "autumn", "red"],
    prompt:
      "a red wooden pagoda temple among autumn maple trees, curved tiled roofs, stone lanterns and a mossy path, soft afternoon light",
  },
  {
    id: "moorish-arches",
    name: "Moorish arches",
    category: "architecture",
    tags: ["andalusia", "arches", "palace", "tiles"],
    prompt:
      "a courtyard of moorish horseshoe arches with intricate carved stucco, colorful tiles and a reflecting pool, warm golden light",
  },
  {
    id: "grand-library",
    name: "Grand library",
    category: "architecture",
    tags: ["books", "reading", "wood", "classic"],
    prompt:
      "a grand old library with towering wooden bookshelves, rolling ladders, brass reading lamps and an arched ceiling, warm light",
    negativePrompt: "people",
  },
  {
    id: "modern-villa",
    name: "Modern villa",
    category: "architecture",
    tags: ["house", "pool", "minimal", "luxury"],
    prompt:
      "a minimalist modern villa with glass walls and a long infinity pool, white stone terraces and olive trees, bright summer daylight",
    negativePrompt: "people",
  },
  {
    id: "classical-columns",
    name: "Classical columns",
    category: "architecture",
    tags: ["greece", "ancient", "temple", "marble"],
    prompt:
      "white marble doric columns of an ancient greek temple against a deep blue sky, warm sunlight and crisp shadows",
  },
  {
    id: "brutalist",
    name: "Brutalist concrete",
    category: "architecture",
    tags: ["modern", "concrete", "geometric", "grey"],
    prompt:
      "a brutalist concrete building with repeating geometric balconies and deep shadows, raw board-marked texture, clear sky, architectural photography",
  },
  // Painting
  {
    id: "oil-painting",
    name: "Oil painting",
    category: "painting",
    tags: ["impasto", "lighthouse", "coast", "brushstrokes"],
    prompt:
      "a lighthouse on a rocky coast at sunset, thick impasto oil painting, visible brush strokes, rich warm colors",
    swatch: "linear-gradient(135deg, #fcd34d 0%, #f97316 45%, #1e40af 100%)",
  },
  {
    id: "fauvist",
    name: "Fauvist harbor",
    category: "painting",
    tags: ["fauvism", "bold", "colorful", "harbor"],
    prompt:
      "a harbor town with boats and hills painted in fauvist style, bold unnatural colors, loose expressive brushwork, vivid pink, green and orange",
  },
  {
    id: "gouache-hills",
    name: "Gouache landscape",
    category: "painting",
    tags: ["gouache", "hills", "landscape", "bold"],
    prompt:
      "rolling hills, cypress trees and a winding road painted in bold flat gouache, saturated greens, ochre and blue",
  },
  {
    id: "ukiyo-e",
    name: "Ukiyo-e wave",
    category: "painting",
    tags: ["japanese", "wave", "woodblock", "print", "blue"],
    prompt:
      "a great ocean wave with mount fuji in the distance, japanese ukiyo-e woodblock print, prussian blue and cream, fine line work",
    swatch: "linear-gradient(135deg, #fef9c3 0%, #93c5fd 45%, #1e3a8a 100%)",
  },
  {
    id: "botanical-watercolor",
    name: "Botanical watercolor",
    category: "painting",
    tags: ["flowers", "watercolor", "pastel", "leaves"],
    prompt:
      "a botanical watercolor illustration of wildflowers and leaves, soft pastel colors, delicate brush strokes on textured paper",
    swatch: "linear-gradient(135deg, #fef3c7 0%, #c4b5fd 50%, #6ee7b7 100%)",
  },
  {
    id: "soft-pastel",
    name: "Soft pastel",
    category: "painting",
    tags: ["chalk", "sunflowers", "drawing", "warm"],
    prompt:
      "a field of sunflowers under a summer sky drawn in soft chalk pastels, visible grainy strokes on toned paper, warm and gentle",
  },
  {
    id: "impressionist",
    name: "Impressionist garden",
    category: "painting",
    tags: ["water lilies", "garden", "pond", "pastel"],
    prompt:
      "a water lily pond with a small wooden bridge, impressionist painting, dappled light, soft broken brush strokes, pastel greens and pinks",
    swatch: "linear-gradient(135deg, #fbcfe8 0%, #a7f3d0 50%, #3b82f6 100%)",
  },
  {
    id: "persian-miniature",
    name: "Persian miniature",
    category: "painting",
    tags: ["iran", "garden", "gold", "ornate"],
    prompt:
      "a persian miniature painting of a walled paradise garden with cypress trees, fountains and blossoming trees, gold leaf, jewel colors, fine detail",
    negativePrompt: "people",
  },
  {
    id: "bird-and-flower",
    name: "Bird & flower",
    category: "painting",
    tags: ["chinese", "birds", "flowers", "silk"],
    prompt:
      "a chinese gongbi painting of magnolia branches and songbirds, fine ink outlines and delicate mineral colors on silk, elegant",
  },
  {
    id: "cubist-still-life",
    name: "Cubist still life",
    category: "painting",
    tags: ["cubism", "geometric", "guitar", "abstract"],
    prompt:
      "a still life of a guitar, a fruit bowl and a bottle broken into overlapping geometric planes, cubist painting, muted ochre, blue and brown",
  },
  {
    id: "dutch-still-life",
    name: "Dutch still life",
    category: "painting",
    tags: ["flowers", "bouquet", "classic", "oil"],
    prompt:
      "a lavish bouquet of tulips, roses and peonies in a vase on a stone ledge, golden age still life oil painting, warm brown background, soft light",
  },
  {
    id: "seaside-sketch",
    name: "Seaside sketch",
    category: "painting",
    tags: ["sea", "boats", "plein air", "summer"],
    prompt:
      "a loose plein air painting of a seaside harbor with sailboats, quick confident brushstrokes, bright summer light, fresh blues and whites",
  },
  {
    id: "ink-wash",
    name: "Ink wash",
    category: "painting",
    tags: ["chinese", "mountains", "black and white", "minimal", "sumi-e"],
    prompt:
      "misty mountains and pine trees, chinese ink wash painting, black ink on rice paper, minimal, elegant, soft gradients",
    swatch: "linear-gradient(135deg, #f5f5f4 0%, #a8a29e 50%, #1c1917 100%)",
  },
  // Illustration
  {
    id: "storybook",
    name: "Storybook",
    category: "illustration",
    tags: ["kids", "children's book", "fox", "cozy", "gouache"],
    prompt:
      "a whimsical storybook illustration of a fox family in a cozy burrow, warm lamplight, gouache, children's book art",
    swatch: "linear-gradient(135deg, #fde68a 0%, #fb923c 50%, #78350f 100%)",
  },
  {
    id: "voxel-island",
    name: "Voxel island",
    category: "illustration",
    tags: ["3d", "cubes", "game", "island"],
    prompt:
      "a small floating voxel island with trees, a waterfall and a tiny house, cube-based 3d game art, bright daylight, isometric view",
  },
  {
    id: "retro-poster",
    name: "Retro travel poster",
    category: "illustration",
    tags: ["vintage", "travel", "mountains", "art deco"],
    prompt:
      "a vintage travel poster of a national park with mountains and a river, flat colors, screen print texture, art deco style",
    swatch: "linear-gradient(135deg, #fef3c7 0%, #f97316 45%, #134e4a 100%)",
  },
  {
    id: "anime-sky",
    name: "Anime sky",
    category: "illustration",
    tags: ["clouds", "summer", "sky", "blue"],
    prompt:
      "a hillside town under a huge summer sky with towering cumulus clouds, anime background art, vivid blue, highly detailed",
    swatch: "linear-gradient(135deg, #bfdbfe 0%, #60a5fa 45%, #16a34a 100%)",
  },
  {
    id: "kawaii-sweets",
    name: "Kawaii sweets",
    category: "illustration",
    tags: ["cute", "pastel", "desserts", "cartoon"],
    prompt:
      "cute kawaii desserts with happy faces, strawberry cakes, mochi and macarons, pastel pink and mint, soft cartoon illustration",
  },
  {
    id: "pixel-art",
    name: "Pixel art",
    category: "illustration",
    tags: ["8-bit", "16-bit", "game", "castle", "retro"],
    prompt:
      "a pixel art fantasy landscape with a castle, waterfalls and forest, 16-bit video game style, vibrant palette",
    swatch: "linear-gradient(135deg, #a78bfa 0%, #22c55e 50%, #0ea5e9 100%)",
  },
  {
    id: "paper-collage",
    name: "Paper collage",
    category: "illustration",
    tags: ["collage", "paper", "bold", "tropical"],
    prompt:
      "a cut paper collage of a tropical scene with layered leaves, a sun and waves, torn edges, bold flat colors, handmade",
  },
  {
    id: "isometric-city",
    name: "Isometric city",
    category: "illustration",
    tags: ["3d", "miniature", "city", "pastel"],
    prompt:
      "an isometric miniature city block with tiny cars, trees, shops and rooftops, clean 3d render, soft shadows, pastel colors",
    swatch: "linear-gradient(135deg, #e0e7ff 0%, #a5b4fc 50%, #f472b6 100%)",
  },
  {
    id: "flat-vector",
    name: "Flat vector",
    category: "illustration",
    tags: ["flat", "vector", "minimal", "landscape"],
    prompt:
      "a flat vector illustration of rolling hills, a winding road and a small town, clean shapes, a limited palette and smooth gradients, modern",
  },
  {
    id: "low-poly",
    name: "Low poly",
    category: "illustration",
    tags: ["3d", "geometric", "polygon", "mountains"],
    prompt:
      "a low poly 3d landscape of mountains, pine trees and a lake, faceted geometric shapes, soft pastel lighting",
  },
  {
    id: "cottage-garden",
    name: "Cottage garden",
    category: "illustration",
    tags: ["cottage", "flowers", "cozy", "fairy tale"],
    prompt:
      "a whimsical illustration of a thatched cottage with a flower garden, a picket fence and climbing roses, soft watercolor and ink",
  },
  {
    id: "sticker-sheet",
    name: "Sticker sheet",
    category: "illustration",
    tags: ["stickers", "cute", "playful", "colorful"],
    prompt:
      "a sheet of glossy die-cut stickers of plants, coffee cups, stars and clouds with white borders, bright flat colors, playful",
  },
  {
    id: "treasure-map",
    name: "Treasure map",
    category: "illustration",
    tags: ["map", "adventure", "vintage", "parchment"],
    prompt:
      "an illustrated antique treasure map with islands, a compass rose, sea serpents and dotted trails, inked lines on aged parchment",
  },
  {
    id: "clay-diorama",
    name: "Clay diorama",
    category: "illustration",
    tags: ["clay", "3d", "miniature", "stop motion", "cute"],
    prompt:
      "a tiny handmade clay diorama of a seaside village with boats and a lighthouse, plasticine texture, soft studio lighting, tilt-shift",
  },
  // Photography
  {
    id: "hot-air-balloons",
    name: "Hot air balloons",
    category: "photo",
    tags: ["balloons", "sunrise", "colorful", "travel"],
    prompt:
      "colorful hot air balloons floating over a valley of rock formations at sunrise, warm golden light, travel photography",
  },
  {
    id: "aerial-beach",
    name: "Aerial beach",
    category: "photo",
    tags: ["drone", "ocean", "summer", "sand", "blue"],
    prompt:
      "an aerial drone photograph of turquoise waves rolling onto white sand, foam patterns and a few beach umbrellas, bright summer sun",
  },
  {
    id: "tilt-shift",
    name: "Tilt-shift town",
    category: "photo",
    tags: ["miniature", "toy", "town", "aerial"],
    prompt:
      "a tilt-shift photograph of a seaside town and harbor that looks like a miniature model, saturated colors, shallow focus, bright daylight",
  },
  {
    id: "infrared",
    name: "Infrared",
    category: "photo",
    tags: ["surreal", "pink", "trees", "lake"],
    prompt:
      "infrared landscape photography of a lake with trees in pink and white foliage, deep teal water, surreal dreamy color",
  },
  {
    id: "light-trails",
    name: "Light trails",
    category: "photo",
    tags: ["long exposure", "night", "road", "cars"],
    prompt:
      "long exposure light trails of traffic winding along a mountain road at dusk, streaks of red and white light, deep blue sky",
  },
  {
    id: "film-35mm",
    name: "35mm film",
    category: "photo",
    tags: ["film", "analog", "nostalgic", "beach"],
    prompt:
      "a warm 35mm film photograph of a seaside boardwalk and pastel beach huts, soft grain, faded colors, nostalgic summer afternoon",
    negativePrompt: "people",
  },
  {
    id: "milky-way",
    name: "Milky Way",
    category: "photo",
    tags: ["stars", "night", "galaxy", "sky"],
    prompt:
      "the milky way arching over a desert landscape with rock formations, thousands of stars, long exposure astrophotography",
  },
  {
    id: "dew-drops",
    name: "Dew drops",
    category: "photo",
    tags: ["macro", "water", "morning", "green"],
    prompt:
      "macro photography of dew drops on a spider web and blades of grass at sunrise, sparkling light, soft green bokeh",
  },
  {
    id: "cyanotype",
    name: "Cyanotype",
    category: "photo",
    tags: ["blue", "botanical", "print", "vintage"],
    prompt:
      "a cyanotype sun print of ferns and wildflower silhouettes, prussian blue and white, textured watercolor paper",
  },
  // Craft & texture
  {
    id: "stained-glass",
    name: "Stained glass",
    category: "craft",
    tags: ["church window", "jewel", "colorful", "glass"],
    prompt:
      "a cathedral stained glass window with flowers and birds, glowing jewel tones, lead lines, light shining through",
    swatch: "linear-gradient(135deg, #1d4ed8 0%, #dc2626 50%, #facc15 100%)",
  },
  {
    id: "yarn-balls",
    name: "Yarn balls",
    category: "craft",
    tags: ["yarn", "wool", "knitting", "colorful"],
    prompt:
      "a basket of bright yarn balls in coral, mustard, teal and pink with wooden knitting needles, soft daylight",
  },
  {
    id: "mosaic",
    name: "Roman mosaic",
    category: "craft",
    tags: ["tiles", "roman", "ancient", "dolphins"],
    prompt:
      "an ancient roman floor mosaic of dolphins and waves, small stone tesserae, terracotta and blue, detailed texture",
    swatch: "linear-gradient(135deg, #fed7aa 0%, #c2410c 50%, #1e3a8a 100%)",
  },
  {
    id: "blown-glass",
    name: "Blown glass",
    category: "craft",
    tags: ["glass", "colorful", "translucent", "art"],
    prompt:
      "colorful blown glass vases and bowls on a sunny windowsill, swirls of amber, cobalt and emerald, light shining through",
  },
  {
    id: "patchwork-quilt",
    name: "Patchwork quilt",
    category: "craft",
    tags: ["quilt", "fabric", "cozy", "textile"],
    prompt:
      "a handmade patchwork quilt of floral and gingham fabrics in warm colors, visible stitching, soft daylight, textile photography",
  },
  {
    id: "embroidery",
    name: "Embroidery",
    category: "craft",
    tags: ["thread", "stitch", "flowers", "textile"],
    prompt:
      "hand embroidery of a floral wreath on linen fabric, colorful silk thread stitches, close-up textile photography",
    swatch: "linear-gradient(135deg, #f5f5dc 0%, #f472b6 50%, #15803d 100%)",
  },
  {
    id: "papercut",
    name: "Paper cut",
    category: "craft",
    tags: ["paper", "layers", "forest", "deer"],
    prompt:
      "layered paper cut art of a forest with deer, depth and soft shadows between paper layers, teal and orange tones",
    swatch: "linear-gradient(135deg, #99f6e4 0%, #0f766e 50%, #fb923c 100%)",
  },
  {
    id: "knitted-wool",
    name: "Knitted wool",
    category: "craft",
    tags: ["knit", "yarn", "cozy", "winter"],
    prompt:
      "a chunky hand-knitted wool blanket in warm caramel and cream, large soft cable stitches, cozy, warm natural light",
  },
  {
    id: "felted-wool",
    name: "Felted wool",
    category: "craft",
    tags: ["felt", "wool", "handmade", "cute"],
    prompt:
      "a needle-felted wool scene of a meadow with sheep, mushrooms and flowers, soft fuzzy texture, handmade, cozy daylight",
  },
  {
    id: "wood-inlay",
    name: "Wood inlay",
    category: "craft",
    tags: ["wood", "marquetry", "warm", "craft"],
    prompt:
      "intricate wood marquetry of flowers and geometric borders in inlaid oak, walnut and maple veneers, polished, warm light",
  },
  {
    id: "macrame",
    name: "Macramé",
    category: "craft",
    tags: ["boho", "knots", "cotton", "cream"],
    prompt:
      "an intricate cream macrame wall hanging with knots, fringes and wooden beads against a warm beige wall, boho, soft light",
  },
  {
    id: "origami",
    name: "Origami",
    category: "craft",
    tags: ["paper", "japan", "folded", "pastel"],
    prompt:
      "folded paper origami cranes, flowers and boats in pastel paper on a white table, crisp creases, soft shadows",
  },
  {
    id: "marble",
    name: "Marble & gold",
    category: "craft",
    tags: ["luxury", "gold", "stone", "white", "elegant"],
    prompt:
      "polished white marble with veins of gold and grey, luxury texture, studio lighting, ultra detailed",
    negativePrompt: "people, animals",
    swatch: "linear-gradient(135deg, #fafaf9 0%, #d6d3d1 50%, #ca8a04 100%)",
  },
  // Abstract & pattern
  {
    id: "color-blocks",
    name: "Color blocks",
    category: "pattern",
    tags: ["abstract", "bold", "geometric", "colorful"],
    prompt:
      "a bold abstract composition of overlapping color blocks in saturated red, cobalt, orange and pink, flat and modern",
  },
  {
    id: "tropical-print",
    name: "Tropical print",
    category: "pattern",
    tags: ["leaves", "tropical", "flowers", "textile"],
    prompt:
      "a bold tropical print of monstera and palm leaves with pink hibiscus flowers, saturated greens, flat textile pattern",
  },
  {
    id: "lemon-print",
    name: "Lemon print",
    category: "pattern",
    tags: ["lemons", "fruit", "summer", "textile"],
    prompt:
      "a cheerful repeating pattern of yellow lemons and green leaves on a bright blue background, mediterranean summer textile",
  },
  {
    id: "bauhaus",
    name: "Bauhaus",
    category: "pattern",
    tags: ["geometric", "shapes", "modern", "primary colors"],
    prompt:
      "a bauhaus geometric composition of circles, semicircles and squares in primary red, yellow and blue on cream, flat, balanced",
  },
  {
    id: "memphis",
    name: "Memphis",
    category: "pattern",
    tags: ["80s", "squiggles", "playful", "shapes"],
    prompt:
      "a playful memphis design pattern of squiggles, triangles, dots and confetti shapes in pastel and bold colors, flat",
  },
  {
    id: "holographic",
    name: "Holographic",
    category: "pattern",
    tags: ["iridescent", "rainbow", "foil", "y2k"],
    prompt:
      "an iridescent holographic foil surface with shifting rainbow pastels, crinkled texture and soft light leaks",
  },
  {
    id: "geode",
    name: "Geode",
    category: "pattern",
    tags: ["crystal", "agate", "stone", "purple"],
    prompt:
      "a sliced agate geode with concentric bands of lavender, blue and cream around sparkling crystals, polished, macro photography",
  },
  {
    id: "kaleidoscope",
    name: "Kaleidoscope",
    category: "pattern",
    tags: ["symmetry", "mandala", "colorful"],
    prompt:
      "a symmetrical kaleidoscope of jewel-toned glass fragments, flowers and geometric shards, radiant colors",
  },
  {
    id: "fluid-art",
    name: "Fluid art",
    category: "pattern",
    tags: ["fluid", "swirl", "paint", "abstract"],
    prompt:
      "an acrylic pour painting with swirling cells of teal, gold, white and coral, glossy fluid marbling, macro detail",
  },
  {
    id: "toile",
    name: "Toile",
    category: "pattern",
    tags: ["french", "blue", "pastoral", "fabric"],
    prompt:
      "a french toile de jouy pattern of pastoral scenes with trees, cottages and birds, fine engraved lines in blue on cream",
  },
  // Retro & graphic
  {
    id: "synthwave",
    name: "Synthwave",
    category: "retro",
    tags: ["80s", "neon", "sunset", "grid"],
    prompt:
      "an 80s synthwave sunset with a striped sun over a neon grid landscape, palm silhouettes, magenta and cyan glow",
  },
  {
    id: "pop-art",
    name: "Pop art",
    category: "retro",
    tags: ["comic", "halftone", "bold", "dots"],
    prompt:
      "a pop art illustration of a cherry sundae with bold black outlines, comic halftone dots and bright primary colors",
  },
  {
    id: "vaporwave",
    name: "Vaporwave",
    category: "retro",
    tags: ["90s", "pastel", "aesthetic", "palms"],
    prompt:
      "a vaporwave scene with a classical marble bust, a checkered floor, palm trees and a pastel pink and teal sky, retro computer aesthetic",
  },
  {
    id: "groovy-70s",
    name: "Groovy 70s",
    category: "retro",
    tags: ["70s", "flowers", "waves", "hippie"],
    prompt:
      "a groovy 1970s pattern of wavy flowers and swirling rainbows in orange, mustard, brown and pink, retro psychedelic",
  },
  {
    id: "retro-pool",
    name: "Retro pool",
    category: "retro",
    tags: ["60s", "pool", "summer", "pastel"],
    prompt:
      "a mid-century swimming pool with turquoise water, pink sun loungers, palm trees and a striped umbrella, sunny retro style",
    negativePrompt: "people",
  },
  {
    id: "vintage-circus",
    name: "Vintage circus",
    category: "retro",
    tags: ["circus", "vintage", "carnival", "red"],
    prompt:
      "a vintage circus scene with red and cream striped tents, bunting, carousel horses and lights, warm nostalgic colors",
    negativePrompt: "people",
  },
  {
    id: "fifties-diner",
    name: "50s diner",
    category: "retro",
    tags: ["1950s", "diner", "red", "checkered"],
    prompt:
      "a 1950s diner interior with red vinyl booths, a checkered floor, chrome stools and a jukebox, bright cheerful light",
    negativePrompt: "people, logos",
  },
  {
    id: "y2k",
    name: "Y2K",
    category: "retro",
    tags: ["2000s", "chrome", "bubbly", "blue"],
    prompt:
      "a y2k aesthetic scene of bubbly chrome shapes, translucent plastic, butterflies and sparkles in baby blue and silver",
  },
  {
    id: "glitch-art",
    name: "Glitch art",
    category: "retro",
    tags: ["digital", "rgb", "pixels", "distortion"],
    prompt:
      "a glitch art landscape with rgb split, pixel sorting and scan lines over a pastel sunset, digital distortion",
  },
  {
    id: "blueprint",
    name: "Blueprint",
    category: "retro",
    tags: ["technical", "drawing", "blue", "engineering"],
    prompt:
      "a technical blueprint drawing of a vintage sailboat, fine white construction lines and a grid on cyan-blue paper",
  },
  {
    id: "botanical-engraving",
    name: "Botanical engraving",
    category: "retro",
    tags: ["vintage", "etching", "plants", "antique"],
    prompt:
      "a vintage copperplate engraving of botanical specimens, fine cross-hatched lines, hand tinted in soft watercolor on aged paper",
  },
  // Food & drink
  {
    id: "strawberries",
    name: "Strawberries",
    category: "food",
    tags: ["fruit", "berries", "red", "summer"],
    prompt:
      "a bowl of ripe red strawberries with green leaves on a white linen cloth, juicy and glossy, bright food photography",
  },
  {
    id: "vineyard",
    name: "Vineyard",
    category: "food",
    tags: ["wine", "tuscany", "grapes", "italy"],
    prompt:
      "rows of grapevines in a tuscan vineyard at golden hour, cypress trees, rolling hills, landscape photography",
    swatch: "linear-gradient(135deg, #fde68a 0%, #84cc16 45%, #581c87 100%)",
  },
  {
    id: "fruit-market",
    name: "Fruit market",
    category: "food",
    tags: ["fruit", "market", "colorful", "oranges"],
    prompt:
      "a colorful outdoor fruit market stall piled with oranges, lemons, grapes and melons, vibrant, street photography",
    swatch: "linear-gradient(135deg, #fde047 0%, #f97316 50%, #7e22ce 100%)",
  },
  {
    id: "macarons",
    name: "Macarons",
    category: "food",
    tags: ["dessert", "pastel", "bakery", "sweet"],
    prompt:
      "rows of pastel french macarons in pink, pistachio, lavender and lemon on a marble counter, soft natural light, food photography",
  },
  {
    id: "ramen",
    name: "Ramen bowl",
    category: "food",
    tags: ["japanese", "noodles", "soup", "bowl"],
    prompt:
      "a steaming bowl of ramen with a soft egg, chashu, scallions and nori, overhead view on a light wooden table, warm light",
  },
  {
    id: "latte-art",
    name: "Coffee shop",
    category: "food",
    tags: ["coffee", "cafe", "breakfast", "croissant"],
    prompt:
      "a top-down view of a cafe table with latte art cups, croissants and coffee beans on dark wood, food photography",
    swatch: "linear-gradient(135deg, #fef3c7 0%, #a16207 50%, #451a03 100%)",
  },
  {
    id: "sushi",
    name: "Sushi platter",
    category: "food",
    tags: ["japanese", "fish", "restaurant"],
    prompt:
      "an overhead shot of an elegant sushi platter with salmon, tuna and rolls on slate, chopsticks, soft natural light",
    swatch: "linear-gradient(135deg, #fecaca 0%, #f97316 45%, #1f2937 100%)",
  },
  {
    id: "citrus-slices",
    name: "Citrus slices",
    category: "food",
    tags: ["fruit", "orange", "fresh", "summer"],
    prompt:
      "fresh slices of orange, lemon, lime and grapefruit on a deep teal plate, juicy translucent segments, bright overhead light",
  },
  {
    id: "breakfast-bowl",
    name: "Breakfast bowl",
    category: "food",
    tags: ["breakfast", "berries", "healthy", "fresh"],
    prompt:
      "an overhead breakfast bowl of yogurt with blueberries, strawberries, granola and mint leaves, bright and fresh, food photography",
  },
  {
    id: "matcha",
    name: "Matcha tea",
    category: "food",
    tags: ["tea", "japanese", "green", "calm"],
    prompt:
      "a matcha tea setting with a bamboo whisk, a ceramic bowl of bright green tea and wagashi sweets on a linen cloth, calm natural light",
  },
  {
    id: "bakery-bread",
    name: "Bakery bread",
    category: "food",
    tags: ["bakery", "bread", "sourdough", "warm"],
    prompt:
      "rustic sourdough loaves and baguettes with golden crusts and flour dust on a linen cloth, warm bakery light",
  },
  {
    id: "street-tacos",
    name: "Street tacos",
    category: "food",
    tags: ["mexican", "tacos", "colorful", "street food"],
    prompt:
      "colorful street tacos with radishes, cilantro, lime wedges and salsa on a bright tiled table, overhead food photography",
  },
  {
    id: "spice-market",
    name: "Spice market",
    category: "food",
    tags: ["spices", "market", "colorful", "india"],
    prompt:
      "bowls and mounds of colorful spices, turmeric, paprika, saffron and cardamom, at a market stall, top-down, rich warm tones",
  },
  {
    id: "dim-sum",
    name: "Dim sum",
    category: "food",
    tags: ["chinese", "dumplings", "tea", "restaurant"],
    prompt:
      "bamboo steamers full of dim sum dumplings, buns and shumai with tea cups and chopsticks, steam rising, warm restaurant light",
  },
  // World traditions
  {
    id: "talavera",
    name: "Talavera pottery",
    category: "culture",
    tags: ["mexico", "pottery", "flowers", "colorful"],
    prompt:
      "mexican talavera pottery with bold hand-painted flowers in cobalt, yellow and green on glossy white glaze, close-up",
  },
  {
    id: "papel-picado",
    name: "Papel picado",
    category: "culture",
    tags: ["mexico", "paper", "festival", "colorful"],
    prompt:
      "rows of colorful mexican papel picado cut paper banners with floral cutouts strung across a sunny courtyard, festive",
  },
  {
    id: "zellige",
    name: "Zellige tiles",
    category: "culture",
    tags: ["morocco", "tiles", "geometric", "green"],
    prompt:
      "a wall of moroccan zellige tiles in glossy emerald, cobalt and white forming an eight-pointed star pattern, handmade irregular glaze",
  },
  {
    id: "azulejo",
    name: "Azulejo tiles",
    category: "culture",
    tags: ["portugal", "tiles", "blue and white"],
    prompt:
      "portuguese azulejo tiles with ornate blue and white floral patterns, glossy hand-painted ceramic, soft daylight",
  },
  {
    id: "wax-print",
    name: "Wax print",
    category: "culture",
    tags: ["africa", "fabric", "bold", "pattern"],
    prompt:
      "west african wax print fabric with bold circles, leaves and geometric shapes in orange, teal, yellow and black, crisp cotton",
  },
  {
    id: "truck-art",
    name: "Truck art",
    category: "culture",
    tags: ["south asia", "folk art", "colorful", "painted"],
    prompt:
      "south asian truck art with bright floral motifs, peacocks and geometric borders in vivid red, green, yellow and blue, glossy paint",
  },
  {
    id: "iznik",
    name: "Iznik tiles",
    category: "culture",
    tags: ["turkey", "tiles", "tulips", "ornate"],
    prompt:
      "ottoman iznik ceramic tiles with tulips, carnations and saz leaves in turquoise, cobalt and tomato red on white",
  },
  {
    id: "blue-white-porcelain",
    name: "Blue & white porcelain",
    category: "culture",
    tags: ["china", "ceramics", "blue and white", "vase"],
    prompt:
      "chinese blue and white porcelain with painted lotus scrolls and clouds, glossy glaze, cobalt on white, close-up",
  },
  {
    id: "shibori",
    name: "Shibori indigo",
    category: "culture",
    tags: ["japan", "indigo", "fabric", "dye"],
    prompt:
      "japanese shibori indigo-dyed cotton with folded and bound patterns, deep blue and white, soft fabric texture",
  },
  {
    id: "batik",
    name: "Batik",
    category: "culture",
    tags: ["indonesia", "fabric", "wax", "pattern"],
    prompt:
      "indonesian batik fabric with intricate wax-resist patterns of flowers and birds in indigo, brown and cream, fine crackle lines",
  },
  // Seasonal
  {
    id: "christmas-ornaments",
    name: "Christmas ornaments",
    category: "seasonal",
    tags: ["christmas", "holidays", "red", "gold", "winter"],
    prompt:
      "glass christmas ornaments, pine branches, red berries and golden fairy lights, soft bokeh, festive and warm",
  },
  {
    id: "winter-cabin",
    name: "Winter cabin",
    category: "seasonal",
    tags: ["christmas", "snow", "cozy", "holidays"],
    prompt:
      "a snowy log cabin in the woods at night with warm lights, christmas trees and falling snow, cozy, highly detailed",
    swatch: "linear-gradient(135deg, #e0f2fe 0%, #1e3a8a 55%, #f59e0b 100%)",
  },
  {
    id: "halloween",
    name: "Halloween",
    category: "seasonal",
    tags: ["pumpkins", "spooky", "october", "autumn"],
    prompt:
      "a pumpkin patch at night with glowing jack-o-lanterns, twisted trees and a full moon, spooky but cute, highly detailed",
    swatch: "linear-gradient(135deg, #1e1b4b 0%, #ea580c 55%, #facc15 100%)",
  },
  {
    id: "spring-blossom",
    name: "Spring blossom",
    category: "seasonal",
    tags: ["cherry blossom", "sakura", "pink", "spring"],
    prompt:
      "cherry blossom trees in full bloom along a canal, petals drifting, soft pink light, spring, photorealistic",
    swatch: "linear-gradient(135deg, #fdf2f8 0%, #f9a8d4 50%, #be185d 100%)",
  },
  {
    id: "diwali",
    name: "Festival of lights",
    category: "seasonal",
    tags: ["diwali", "lamps", "india", "festival", "rangoli"],
    prompt:
      "hundreds of glowing oil lamps and rangoli patterns on a courtyard at night, marigold garlands, warm festive light",
    swatch: "linear-gradient(135deg, #451a03 0%, #f59e0b 50%, #e11d48 100%)",
  },
  {
    id: "lunar-new-year",
    name: "Lunar New Year",
    category: "seasonal",
    tags: ["chinese new year", "red", "lanterns", "gold"],
    prompt:
      "red paper lanterns and plum blossoms with gold accents, a lunar new year celebration, warm festive light, highly detailed",
  },
  {
    id: "valentines",
    name: "Valentine's roses",
    category: "seasonal",
    tags: ["valentine's day", "love", "roses", "pink"],
    prompt:
      "a romantic arrangement of red and pink roses, rose petals and small heart-shaped chocolates on cream silk, soft light",
  },
  {
    id: "easter-eggs",
    name: "Easter eggs",
    category: "seasonal",
    tags: ["easter", "spring", "eggs", "pastel"],
    prompt:
      "pastel painted easter eggs in a nest with spring flowers, tulips and daisies, soft morning light, fresh and cheerful",
  },
  {
    id: "holi",
    name: "Holi colors",
    category: "seasonal",
    tags: ["holi", "india", "colors", "festival"],
    prompt:
      "clouds of bright holi color powder in pink, yellow, green and blue bursting against a white wall, joyful festival",
    negativePrompt: "people",
  },
  {
    id: "summer-beach",
    name: "Summer beach",
    category: "seasonal",
    tags: ["summer", "beach", "vacation", "sea"],
    prompt:
      "a sunny beach day with striped umbrellas, a surfboard, seashells and clear turquoise water, bright summer light",
    negativePrompt: "people",
  },
  {
    id: "harvest-table",
    name: "Harvest table",
    category: "seasonal",
    tags: ["thanksgiving", "autumn", "harvest", "cozy"],
    prompt:
      "an autumn harvest table with pumpkins, apples, wheat, candles and fall leaves on linen, warm golden light",
  },
  {
    id: "mid-autumn",
    name: "Mid-autumn festival",
    category: "seasonal",
    tags: ["moon", "lanterns", "mooncakes", "autumn"],
    prompt:
      "glowing paper lanterns, mooncakes and osmanthus flowers under a full moon, mid-autumn festival, warm golden light",
  },
  {
    id: "ramadan-lanterns",
    name: "Ramadan lanterns",
    category: "seasonal",
    tags: ["ramadan", "eid", "lanterns", "gold"],
    prompt:
      "ornate brass ramadan lanterns glowing with warm light, a crescent moon, dates and soft fabric, festive evening",
  },
  {
    id: "hanukkah",
    name: "Hanukkah lights",
    category: "seasonal",
    tags: ["hanukkah", "candles", "blue", "holidays"],
    prompt:
      "a glowing hanukkah menorah with blue and white candles, silver dreidels and gold coins, warm soft light, festive",
  },
  {
    id: "new-year-fireworks",
    name: "New Year fireworks",
    category: "seasonal",
    tags: ["new year", "fireworks", "celebration", "gold"],
    prompt:
      "golden fireworks bursting over a city skyline at midnight, glittering trails and reflections on a river, celebration",
  },
  {
    id: "winter-frost",
    name: "Winter frost",
    category: "seasonal",
    tags: ["winter", "ice", "snowflakes", "blue"],
    prompt:
      "delicate frost crystals and snowflakes on a window pane, icy blue and white, soft morning light, macro",
  },
  // Fantasy & sci-fi
  {
    id: "sunken-city",
    name: "Sunken city",
    category: "fantasy",
    tags: ["underwater", "ruins", "ocean", "atlantis"],
    prompt:
      "an ancient sunken city underwater with marble columns, coral and schools of fish, sun rays from the surface, fantasy art",
  },
  {
    id: "floating-islands",
    name: "Floating islands",
    category: "fantasy",
    tags: ["fantasy", "waterfalls", "sky"],
    prompt:
      "floating islands with waterfalls in a bright sky, lush greenery, ancient ruins, epic fantasy concept art, highly detailed",
    swatch: "linear-gradient(135deg, #bae6fd 0%, #4ade80 50%, #0369a1 100%)",
  },
  {
    id: "sky-castle",
    name: "Sky castle",
    category: "fantasy",
    tags: ["castle", "clouds", "sunset", "epic"],
    prompt:
      "a white castle with tall spires on a cloud above a golden sunset sea of clouds, epic fantasy concept art",
  },
  {
    id: "dragon-lair",
    name: "Dragon's lair",
    category: "fantasy",
    tags: ["dragon", "gold", "cave", "fantasy"],
    prompt:
      "a sleeping dragon on a hoard of gold coins in a vast cave, glowing crystals, dramatic light, fantasy art",
    swatch: "linear-gradient(135deg, #1c1917 0%, #ca8a04 50%, #059669 100%)",
  },
  {
    id: "crystal-cave",
    name: "Crystal cave",
    category: "fantasy",
    tags: ["crystals", "purple", "cave", "magic"],
    prompt:
      "a vast cave of giant amethyst and quartz crystals glowing violet and blue, shafts of light, fantasy art",
  },
  {
    id: "glowing-mushrooms",
    name: "Glowing mushrooms",
    category: "fantasy",
    tags: ["magic", "forest", "glowing", "fairy"],
    prompt:
      "an enchanted forest of glowing bioluminescent mushrooms, fireflies and moss at twilight, soft magical light",
  },
  {
    id: "steampunk",
    name: "Steampunk",
    category: "fantasy",
    tags: ["gears", "brass", "victorian", "machine"],
    prompt:
      "an intricate steampunk machine room with brass gears, copper pipes and gauges, warm lamplight, highly detailed",
    swatch: "linear-gradient(135deg, #fef3c7 0%, #b45309 50%, #292524 100%)",
  },
  {
    id: "space-nebula",
    name: "Space nebula",
    category: "fantasy",
    tags: ["space", "stars", "planet", "galaxy", "cosmic"],
    prompt:
      "a colorful deep space nebula with stars and a ringed planet, cosmic dust, astrophotography, ultra detailed",
    swatch: "linear-gradient(135deg, #020617 0%, #7c3aed 50%, #f472b6 100%)",
  },
  {
    id: "ice-palace",
    name: "Ice palace",
    category: "fantasy",
    tags: ["ice", "winter", "palace", "blue"],
    prompt:
      "a shimmering ice palace with frozen towers and icicles, pale blue light, drifting snow, fairy tale",
  },
  {
    id: "alien-planet",
    name: "Alien planet",
    category: "fantasy",
    tags: ["space", "planet", "sci-fi", "moons"],
    prompt:
      "an alien planet landscape with strange coral-like plants, two moons and a pastel sky, sci-fi concept art",
  },
  {
    id: "potion-shop",
    name: "Potion shop",
    category: "fantasy",
    tags: ["magic", "wizard", "bottles", "cozy"],
    prompt:
      "a cozy wizard's apothecary with shelves of glowing potion bottles, dried herbs, candles and old books, warm light",
  },
  {
    id: "fairy-village",
    name: "Fairy village",
    category: "fantasy",
    tags: ["fairy", "tiny", "cute", "garden"],
    prompt:
      "a tiny fairy village of mushroom houses with round doors, lanterns and flowers in a mossy garden, whimsical, soft light",
  },
];
