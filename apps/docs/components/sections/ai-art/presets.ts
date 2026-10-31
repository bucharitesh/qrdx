// Style presets for AI QR art. Prompts are written for Stable Diffusion 1.5
// (Realistic Vision), which Illusion Diffusion runs: concrete scenes, light
// and texture words, no text in the image.

export const AI_ART_CATEGORIES = [
  { id: "nature", label: "Nature" },
  { id: "places", label: "Places" },
  { id: "painting", label: "Painting" },
  { id: "illustration", label: "Illustration" },
  { id: "craft", label: "Craft & texture" },
  { id: "food", label: "Food & drink" },
  { id: "seasonal", label: "Seasonal" },
  { id: "fantasy", label: "Fantasy & sci-fi" },
] as const;

export type AIArtCategory = (typeof AI_ART_CATEGORIES)[number]["id"];

export interface AIArtPreset {
  id: string;
  name: string;
  category: AIArtCategory;
  prompt: string;
  /** Added to the negative prompt when this preset is picked. */
  negativePrompt?: string;
  /** CSS background for the preset card swatch. */
  swatch: string;
}

export const AI_ART_PRESETS: AIArtPreset[] = [
  // Nature
  {
    id: "zen-garden",
    name: "Zen garden",
    category: "nature",
    prompt:
      "a serene japanese zen garden with a koi pond, cherry blossoms, stone lanterns and moss, soft morning light, highly detailed, photorealistic",
    swatch: "linear-gradient(135deg, #f9a8d4 0%, #86efac 55%, #166534 100%)",
  },
  {
    id: "coral-reef",
    name: "Coral reef",
    category: "nature",
    prompt:
      "a vibrant underwater coral reef with tropical fish and sea turtles, sun rays through clear turquoise water, highly detailed",
    swatch: "linear-gradient(135deg, #22d3ee 0%, #0e7490 50%, #fb7185 100%)",
  },
  {
    id: "autumn-forest",
    name: "Autumn forest",
    category: "nature",
    prompt:
      "an enchanted autumn forest with golden and red leaves, a winding path, soft fog and sunbeams, highly detailed",
    swatch: "linear-gradient(135deg, #fde68a 0%, #ea580c 55%, #7f1d1d 100%)",
  },
  {
    id: "mountain-lake",
    name: "Mountain lake",
    category: "nature",
    prompt:
      "a crystal clear alpine lake surrounded by snowy peaks and pine trees, mirror reflections, golden hour, landscape photography",
    swatch: "linear-gradient(135deg, #e0f2fe 0%, #38bdf8 45%, #14532d 100%)",
  },
  {
    id: "desert-dunes",
    name: "Desert dunes",
    category: "nature",
    prompt:
      "rolling sand dunes in the sahara at sunset, long shadows, rippled sand texture, warm orange light, aerial photography",
    swatch: "linear-gradient(135deg, #fed7aa 0%, #f59e0b 50%, #9a3412 100%)",
  },
  {
    id: "wildflower-meadow",
    name: "Wildflower meadow",
    category: "nature",
    prompt:
      "a dense wildflower meadow with poppies, daisies and lavender, bees, soft bokeh, spring morning, macro photography",
    swatch: "linear-gradient(135deg, #fecaca 0%, #c4b5fd 50%, #4d7c0f 100%)",
  },
  {
    id: "northern-lights",
    name: "Northern lights",
    category: "nature",
    prompt:
      "aurora borealis over a frozen lake and snowy forest at night, green and purple sky, stars, long exposure photography",
    swatch: "linear-gradient(135deg, #0f172a 0%, #10b981 50%, #a855f7 100%)",
  },
  // Places
  {
    id: "alpine-village",
    name: "Alpine village",
    category: "places",
    prompt:
      "a cozy alpine village in snowy mountains at dusk, warm glowing windows, pine forest, cinematic lighting, highly detailed",
    swatch: "linear-gradient(135deg, #e0f2fe 0%, #64748b 55%, #f59e0b 100%)",
  },
  {
    id: "neon-city",
    name: "Neon city",
    category: "places",
    prompt:
      "a futuristic cyberpunk city street at night, neon signs, rain reflections on the pavement, cinematic, ultra detailed",
    swatch: "linear-gradient(135deg, #0f172a 0%, #7c3aed 50%, #ec4899 100%)",
  },
  {
    id: "mediterranean-town",
    name: "Mediterranean town",
    category: "places",
    prompt:
      "white houses with blue domes on a cliff above the aegean sea, bougainvillea, bright summer sun, travel photography",
    swatch: "linear-gradient(135deg, #ffffff 0%, #60a5fa 50%, #1e3a8a 100%)",
  },
  {
    id: "tokyo-alley",
    name: "Tokyo alley",
    category: "places",
    prompt:
      "a narrow tokyo alley at night with paper lanterns, small izakaya shopfronts and wet cobblestones, cinematic, highly detailed",
    swatch: "linear-gradient(135deg, #1f2937 0%, #dc2626 50%, #fbbf24 100%)",
  },
  {
    id: "aerial-farmland",
    name: "Aerial farmland",
    category: "places",
    prompt:
      "aerial view of patchwork farmland fields, rows of crops, tractors, winding river, drone photography, crisp detail",
    swatch: "linear-gradient(135deg, #bef264 0%, #65a30d 45%, #a16207 100%)",
  },
  // Painting
  {
    id: "oil-painting",
    name: "Oil painting",
    category: "painting",
    prompt:
      "a lighthouse on a rocky coast at sunset, thick impasto oil painting, visible brush strokes, rich warm colors",
    swatch: "linear-gradient(135deg, #fcd34d 0%, #f97316 45%, #1e40af 100%)",
  },
  {
    id: "botanical-watercolor",
    name: "Botanical watercolor",
    category: "painting",
    prompt:
      "a botanical watercolor illustration of wildflowers and leaves, soft pastel colors, delicate brush strokes on textured paper",
    swatch: "linear-gradient(135deg, #fef3c7 0%, #c4b5fd 50%, #6ee7b7 100%)",
  },
  {
    id: "ukiyo-e",
    name: "Ukiyo-e wave",
    category: "painting",
    prompt:
      "a great ocean wave with mount fuji in the distance, japanese ukiyo-e woodblock print, prussian blue and cream, fine line work",
    swatch: "linear-gradient(135deg, #fef9c3 0%, #93c5fd 45%, #1e3a8a 100%)",
  },
  {
    id: "impressionist",
    name: "Impressionist garden",
    category: "painting",
    prompt:
      "a water lily pond with a small wooden bridge, impressionist painting, dappled light, soft broken brush strokes, pastel greens and pinks",
    swatch: "linear-gradient(135deg, #fbcfe8 0%, #a7f3d0 50%, #3b82f6 100%)",
  },
  {
    id: "ink-wash",
    name: "Ink wash",
    category: "painting",
    prompt:
      "misty mountains and pine trees, chinese ink wash painting, black ink on rice paper, minimal, elegant, soft gradients",
    swatch: "linear-gradient(135deg, #f5f5f4 0%, #a8a29e 50%, #1c1917 100%)",
  },
  // Illustration
  {
    id: "storybook",
    name: "Storybook",
    category: "illustration",
    prompt:
      "a whimsical storybook illustration of a fox family in a cozy burrow, warm lamplight, gouache, children's book art",
    swatch: "linear-gradient(135deg, #fde68a 0%, #fb923c 50%, #78350f 100%)",
  },
  {
    id: "isometric-city",
    name: "Isometric city",
    category: "illustration",
    prompt:
      "an isometric miniature city block with tiny cars, trees, shops and rooftops, clean 3d render, soft shadows, pastel colors",
    swatch: "linear-gradient(135deg, #e0e7ff 0%, #a5b4fc 50%, #f472b6 100%)",
  },
  {
    id: "retro-poster",
    name: "Retro travel poster",
    category: "illustration",
    prompt:
      "a vintage travel poster of a national park with mountains and a river, flat colors, screen print texture, art deco style",
    swatch: "linear-gradient(135deg, #fef3c7 0%, #f97316 45%, #134e4a 100%)",
  },
  {
    id: "anime-sky",
    name: "Anime sky",
    category: "illustration",
    prompt:
      "a hillside town under a huge summer sky with towering cumulus clouds, anime background art, vivid blue, highly detailed",
    swatch: "linear-gradient(135deg, #bfdbfe 0%, #60a5fa 45%, #16a34a 100%)",
  },
  {
    id: "pixel-art",
    name: "Pixel art",
    category: "illustration",
    prompt:
      "a pixel art fantasy landscape with a castle, waterfalls and forest, 16-bit video game style, vibrant palette",
    swatch: "linear-gradient(135deg, #a78bfa 0%, #22c55e 50%, #0ea5e9 100%)",
  },
  // Craft & texture
  {
    id: "stained-glass",
    name: "Stained glass",
    category: "craft",
    prompt:
      "a cathedral stained glass window with flowers and birds, glowing jewel tones, lead lines, light shining through",
    swatch: "linear-gradient(135deg, #1d4ed8 0%, #dc2626 50%, #facc15 100%)",
  },
  {
    id: "mosaic",
    name: "Roman mosaic",
    category: "craft",
    prompt:
      "an ancient roman floor mosaic of dolphins and waves, small stone tesserae, terracotta and blue, detailed texture",
    swatch: "linear-gradient(135deg, #fed7aa 0%, #c2410c 50%, #1e3a8a 100%)",
  },
  {
    id: "papercut",
    name: "Paper cut",
    category: "craft",
    prompt:
      "layered paper cut art of a forest with deer, depth and soft shadows between paper layers, teal and orange tones",
    swatch: "linear-gradient(135deg, #99f6e4 0%, #0f766e 50%, #fb923c 100%)",
  },
  {
    id: "embroidery",
    name: "Embroidery",
    category: "craft",
    prompt:
      "hand embroidery of a floral wreath on linen fabric, colorful silk thread stitches, close-up textile photography",
    swatch: "linear-gradient(135deg, #f5f5dc 0%, #f472b6 50%, #15803d 100%)",
  },
  {
    id: "marble",
    name: "Marble & gold",
    category: "craft",
    prompt:
      "polished white marble with veins of gold and grey, luxury texture, studio lighting, ultra detailed",
    negativePrompt: "people, animals",
    swatch: "linear-gradient(135deg, #fafaf9 0%, #d6d3d1 50%, #ca8a04 100%)",
  },
  // Food & drink
  {
    id: "latte-art",
    name: "Coffee shop",
    category: "food",
    prompt:
      "a top-down view of a cafe table with latte art cups, croissants and coffee beans on dark wood, food photography",
    swatch: "linear-gradient(135deg, #fef3c7 0%, #a16207 50%, #451a03 100%)",
  },
  {
    id: "sushi",
    name: "Sushi platter",
    category: "food",
    prompt:
      "an overhead shot of an elegant sushi platter with salmon, tuna and rolls on slate, chopsticks, soft natural light",
    swatch: "linear-gradient(135deg, #fecaca 0%, #f97316 45%, #1f2937 100%)",
  },
  {
    id: "fruit-market",
    name: "Fruit market",
    category: "food",
    prompt:
      "a colorful outdoor fruit market stall piled with oranges, lemons, grapes and melons, vibrant, street photography",
    swatch: "linear-gradient(135deg, #fde047 0%, #f97316 50%, #7e22ce 100%)",
  },
  {
    id: "vineyard",
    name: "Vineyard",
    category: "food",
    prompt:
      "rows of grapevines in a tuscan vineyard at golden hour, cypress trees, rolling hills, landscape photography",
    swatch: "linear-gradient(135deg, #fde68a 0%, #84cc16 45%, #581c87 100%)",
  },
  // Seasonal
  {
    id: "winter-cabin",
    name: "Winter cabin",
    category: "seasonal",
    prompt:
      "a snowy log cabin in the woods at night with warm lights, christmas trees and falling snow, cozy, highly detailed",
    swatch: "linear-gradient(135deg, #e0f2fe 0%, #1e3a8a 55%, #f59e0b 100%)",
  },
  {
    id: "halloween",
    name: "Halloween",
    category: "seasonal",
    prompt:
      "a pumpkin patch at night with glowing jack-o-lanterns, twisted trees and a full moon, spooky but cute, highly detailed",
    swatch: "linear-gradient(135deg, #1e1b4b 0%, #ea580c 55%, #facc15 100%)",
  },
  {
    id: "spring-blossom",
    name: "Spring blossom",
    category: "seasonal",
    prompt:
      "cherry blossom trees in full bloom along a canal, petals drifting, soft pink light, spring, photorealistic",
    swatch: "linear-gradient(135deg, #fdf2f8 0%, #f9a8d4 50%, #be185d 100%)",
  },
  {
    id: "diwali",
    name: "Festival of lights",
    category: "seasonal",
    prompt:
      "hundreds of glowing oil lamps and rangoli patterns on a courtyard at night, marigold garlands, warm festive light",
    swatch: "linear-gradient(135deg, #451a03 0%, #f59e0b 50%, #e11d48 100%)",
  },
  // Fantasy & sci-fi
  {
    id: "floating-islands",
    name: "Floating islands",
    category: "fantasy",
    prompt:
      "floating islands with waterfalls in a bright sky, lush greenery, ancient ruins, epic fantasy concept art, highly detailed",
    swatch: "linear-gradient(135deg, #bae6fd 0%, #4ade80 50%, #0369a1 100%)",
  },
  {
    id: "space-nebula",
    name: "Space nebula",
    category: "fantasy",
    prompt:
      "a colorful deep space nebula with stars and a ringed planet, cosmic dust, astrophotography, ultra detailed",
    swatch: "linear-gradient(135deg, #020617 0%, #7c3aed 50%, #f472b6 100%)",
  },
  {
    id: "steampunk",
    name: "Steampunk",
    category: "fantasy",
    prompt:
      "an intricate steampunk machine room with brass gears, copper pipes and gauges, warm lamplight, highly detailed",
    swatch: "linear-gradient(135deg, #fef3c7 0%, #b45309 50%, #292524 100%)",
  },
  {
    id: "dragon-lair",
    name: "Dragon's lair",
    category: "fantasy",
    prompt:
      "a sleeping dragon on a hoard of gold coins in a vast cave, glowing crystals, dramatic light, fantasy art",
    swatch: "linear-gradient(135deg, #1c1917 0%, #ca8a04 50%, #059669 100%)",
  },
];
