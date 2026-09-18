/**
 * AI Image Prompt Design System
 *
 * Single source of truth for every visual style the system supports.
 * Used by:
 *   - sceneGenerator.ts       (when LLM first splits a story into scenes)
 *   - assetGenerator.ts       (per-scene image generation)
 *   - /api/scenes/[id]/regenerate-prompt  (per-scene Reprompt button)
 *
 * Each entry contains:
 *   - systemSnippet:   injected into the LLM system prompt
 *   - userTemplate:    template for the user prompt sent to the LLM
 *   - negativeAvoid:    short negative-prompt list
 *   - environmentBank: list of distinct settings for variety
 *
 * The system prompt guides Kira to write prompts like a professional
 * concept artist — not generic, always style-specific, always varied.
 */

export interface PromptStyleSpec {
  /** Stable key used in code. */
  key: string
  /** Canonical display name (matches ArtStyle.name where possible). */
  displayName: string
  /** Aliases to match against ArtStyle.name case-insensitively. */
  aliases: string[]
  /** Visual treatment description — injected into the LLM system prompt. */
  systemSnippet: string
  /** User-prompt template — the LLM fills in {niche}, {narration}, etc. */
  userTemplate: string
  /** Short negative instructions to append. */
  negativeAvoid: string[]
  /** Bank of distinct environments for variety. */
  environmentBank: string[]
}

// ─── 1. COMIC BOOK ───────────────────────────────────────────────────────────
const comicBook: PromptStyleSpec = {
  key: 'comic-book',
  displayName: 'Comic Book',
  aliases: ['comic', 'comic book', 'graphic novel', 'marvel', 'dc'],
  systemSnippet: `
- Bold black ink outlines, strong expressive linework
- Dynamic poses, dramatic perspective, cel shading
- Halftone textures, graphic-novel composition
- Strong contrast, vibrant colors, hand-inked appearance
- Cinematic lighting, detailed backgrounds
- Typical environments: city rooftops, superhero headquarters, space stations, crime scenes, futuristic cities, sports arenas, adventure locations`,
  userTemplate: `Generate a fresh image prompt for this scene.

SCENE CONTEXT
- Narration (DO NOT change): "{narration}"
- Niche: {niche}
- Style: Comic Book

REQUIREMENTS
1. Cover every section of the framework: subject, action, environment (5–10 details), lighting, camera/composition, comic book style characteristics, mood, quality/texture.
2. Pick a FRESH environment from the comic book setting bank — not a generic dark warehouse. Vary the location across regenerations.
3. Be 30-60 words, dense with visual specifics. No filler.
4. Do NOT include art-style words in your output — the style will be applied automatically.

ENVIRONMENT BANK (pick one, vary across regenerations):
{environmentBank}

Return ONLY valid JSON:
{"prompt": "<your prompt here>"}`,
  negativeAvoid: [
    'flat color',
    'no outlines',
    'photorealistic',
    'washed out',
    'painted without linework',
  ],
  environmentBank: [
    'rooftop of a skyscraper at sunset, billboards flickering, distant traffic',
    'underground fight arena, swinging lights, broken chains, roaring crowd',
    'space station observation deck, Earth visible through glass, floating debris',
    'rooftop garden cafe at golden hour, vines on pergola, espresso cups',
    'ancient library with floating books, glowing sigils, towering shelves',
    'futuristic mag-lev platform, blur of motion, neon schedule boards',
    'abandoned carnival at dusk, broken Ferris wheel, peeling paint',
    'rain-slick city street, neon reflections, pedestrians with umbrellas',
    'volcanic research base, glowing lava tubes, hazmat-suited scientists',
  ],
}

// ─── 2. CREEPY COMIC ──────────────────────────────────────────────────────────
const creepyComic: PromptStyleSpec = {
  key: 'creepy-comic',
  displayName: 'Creepy Comic',
  aliases: ['creepy', 'creepy comic', 'horror comic', 'dark comic'],
  systemSnippet: `
- Heavy black ink, scratchy linework, deep shadows
- Cross-hatching, distorted perspective, unsettling expressions
- Vintage halftone printing, muted colors with selective dark red accents
- Grotesque details, psychological horror atmosphere
- The scene should feel unsettling, but not every image needs blood or gore
- Typical environments: abandoned amusement parks, old hospitals, strange suburban houses, empty schools, carnival tents, foggy streets, strange museums`,
  userTemplate: `Generate a fresh image prompt for this scene.

SCENE CONTEXT
- Narration (DO NOT change): "{narration}"
- Niche: {niche}
- Style: Creepy Comic

REQUIREMENTS
1. Cover every section: subject, action, environment (5–10 details), lighting, camera/composition, creepy comic characteristics, mood, quality/texture.
2. Pick a FRESH unsettling environment from the bank. Vary the location across regenerations.
3. Be 30-60 words. Lean into the unsettling atmosphere — describe the small wrong details that make the scene feel off.
4. Do NOT include art-style words — the style will be applied automatically.

ENVIRONMENT BANK (pick one, vary across regenerations):
{environmentBank}

Return ONLY valid JSON:
{"prompt": "<your prompt here>"}`,
  negativeAvoid: [
    'cheerful',
    'bright primary colors',
    'clean lines',
    'whimsical',
  ],
  environmentBank: [
    'abandoned amusement park, peeling carousel horses, rusted chain-link',
    'foggy suburban street at 3am, one porch light flickering, overgrown hedges',
    'empty elementary school hallway, scattered alphabet blocks, water-stained ceiling',
    'derelict carnival tent, moth-eaten banners, sawdust on the floor',
    'old psychiatric ward, peeling wallpaper in pastel pink, narrow cot',
    'abandoned wax museum, melted faces, dripping candles',
    'flooded basement rec room, water-stained toys, single swinging bulb',
    'forgotten subway platform, broken tiles, a single pair of shoes',
    'vintage hospital corridor, peeling green paint, single chair in middle',
  ],
}

// ─── 3. ANIME ──────────────────────────────────────────────────────────────────
const anime: PromptStyleSpec = {
  key: 'anime',
  displayName: 'Anime',
  aliases: ['anime', 'manga', 'japanese animation'],
  systemSnippet: `
- Clean precise linework, expressive characters
- Stylized anatomy, detailed hair, large expressive eyes where appropriate
- Cel shading, vibrant colors, cinematic backgrounds
- Atmospheric perspective, dynamic clothing, emotional storytelling
- Japanese animation aesthetic
- Typical environments: Japanese countryside, train stations, school festivals, futuristic cities, mountain villages, beaches, space colonies, fantasy kingdoms`,
  userTemplate: `Generate a fresh image prompt for this scene.

SCENE CONTEXT
- Narration (DO NOT change): "{narration}"
- Niche: {niche}
- Style: Anime

REQUIREMENTS
1. Cover every section: subject, action, environment (5–10 details), lighting, camera/composition, anime characteristics, mood, quality/texture.
2. Pick a FRESH Japanese-flavoured environment from the bank. Vary across regenerations.
3. Be 30-60 words. Lean into expressive character moments — emotion shown in pose and gesture, not just face.
4. Do NOT include art-style words — the style will be applied automatically.

ENVIRONMENT BANK (pick one, vary across regenerations):
{environmentBank}

Return ONLY valid JSON:
{"prompt": "<your prompt here>"}`,
  negativeAvoid: [
    'realistic photography',
    'photorealistic',
    '3D render',
    'no linework',
    'western environment',
  ],
  environmentBank: [
    'Shibuya crossing at night, neon billboards, crowds with umbrellas in rain',
    'rural mountain shrine, torii gates, fog, fallen maple leaves',
    'Tokyo train station platform at dusk, salary workers, paper lanterns',
    'summer school festival, paper lanterns, yukata, takoyaki stall smoke',
    'futuristic Akihabara at night, holographic ads, maid cafe entrance',
    'onsen ryokan courtyard, hot springs steam, wooden bridge over koi pond',
    'harajuku backstreet cafe, crepes, fairy lights, vintage posters',
    'anime-style space colony corridor, glass dome showing stars, holographic UI',
    'ancient Kyoto bamboo forest at dawn, soft mist, wooden torii path',
  ],
}

// ─── 4. DARK FANTASY ──────────────────────────────────────────────────────────
const darkFantasy: PromptStyleSpec = {
  key: 'dark-fantasy',
  displayName: 'Dark Fantasy',
  aliases: ['fantasy', 'dark fantasy', 'epic fantasy', 'medieval fantasy'],
  systemSnippet: `
- Medieval or fantastical architecture, intricate costumes and armor
- Ancient magical objects, supernatural elements
- Painterly textures, dramatic lighting, atmospheric depth
- Rich dark jewel tones, mythical creatures, epic scale
- Dark Fantasy does NOT automatically mean: dark forest, blood moon, demon, warrior
- Vary environments significantly: floating magical cities, ancient libraries, enchanted marketplaces, desert kingdoms, magical oceans, underground civilizations, ancient observatories, crystal caves`,
  userTemplate: `Generate a fresh image prompt for this scene.

SCENE CONTEXT
- Narration (DO NOT change): "{narration}"
- Niche: {niche}
- Style: Dark Fantasy

REQUIREMENTS
1. Cover every section: subject, action, environment (5–10 details), lighting, camera/composition, dark fantasy characteristics, mood, quality/texture.
2. Pick a FRESH fantastical environment from the bank — explicitly avoid the cliché "dark forest".
3. Be 30-60 words. Describe the magical artifact, the architectural detail, the supernatural light source.
4. Do NOT include art-style words — the style will be applied automatically.

ENVIRONMENT BANK (pick one, vary across regenerations):
{environmentBank}

Return ONLY valid JSON:
{"prompt": "<your prompt here>"}`,
  negativeAvoid: [
    'modern clothing',
    'technology',
    'contemporary setting',
    'casual clothing',
  ],
  environmentBank: [
    'floating magical city, sky-piercing spires, glowing ley-line bridges',
    'ancient celestial observatory, brass telescopes, star maps on parchment',
    'enchanted bazaar under silk canopies, lantern vendors, talking ravens',
    'crystal cave, prismatic reflections, glowing mushrooms',
    'underground kingdom carved from jade, bioluminescent rivers',
    'desert kingdom at dusk, sandstone palace, glass lanterns',
    'library of forgotten gods, books that whisper, ladders to nowhere',
    'magical ocean trench, leviathan silhouette, coral towers',
    'wizard study on a comet, weightless books, ink frozen mid-air',
  ],
}

// ─── 5. DISNEY-INSPIRED FAIRYTALE ─────────────────────────────────────────────
const disneyFairytale: PromptStyleSpec = {
  key: 'disney-fairytale',
  displayName: 'Disney-Inspired Fairytale Animation',
  aliases: ['disney', 'fairytale', 'pixar', 'cartoon fairytale'],
  systemSnippet: `
- Charming expressive characters, appealing rounded shapes
- Warm facial expressions, whimsical proportions
- Vibrant cheerful colors, hand-painted backgrounds
- Soft cinematic lighting, magical elements
- Playful visual storytelling, family-friendly fantasy atmosphere
- Polished animated-film aesthetic
- Typical environments: European villages, magical bakeries, royal castles, colorful markets, tropical islands, enchanted gardens, cozy cottages, whimsical towns
- Avoid making every scene a castle or princess scene`,
  userTemplate: `Generate a fresh image prompt for this scene.

SCENE CONTEXT
- Narration (DO NOT change): "{narration}"
- Niche: {niche}
- Style: Disney-Inspired Fairytale Animation

REQUIREMENTS
1. Cover every section: subject, action, environment (5–10 details), lighting, camera/composition, Disney characteristics, mood, quality/texture.
2. Pick a FRESH whimsical environment from the bank. Vary across regenerations — do not default to a castle.
3. Be 30-60 words. Capture the warmth: soft textures, gentle light, expressive gestures.
4. Do NOT include art-style words — the style will be applied automatically.

ENVIRONMENT BANK (pick one, vary across regenerations):
{environmentBank}

Return ONLY valid JSON:
{"prompt": "<your prompt here>"}`,
  negativeAvoid: [
    'grimdark',
    'gritty',
    'photorealistic',
    'horror',
    'dark and moody',
  ],
  environmentBank: [
    'magical bakery kitchen, floating pastries, warm hearth light',
    'colorful harbor market, streamers, striped awnings, seagulls',
    'tropical island lagoon, palm trees, glass-clear water, wooden boat',
    'enchanted rooftop garden at sunrise, topiaries, dew on roses',
    'cozy bookshop attic, stacked books, ladder, rain on skylight',
    'royal palace ballroom, chandelier, swirling dance, stained glass',
    'vintage carousel plaza, painted horses, ribbons, sunset glow',
    'magical workshop with floating tools, glowing blueprints',
    'forest cottage kitchen, copper pots, fireflies in jars, bread rising',
  ],
}

// ─── 6. GHIBLI-INSPIRED ────────────────────────────────────────────────────────
const ghibli: PromptStyleSpec = {
  key: 'ghibli',
  displayName: 'Ghibli-Inspired',
  aliases: ['ghibli', 'studio ghibli', 'miyazaki'],
  systemSnippet: `
- Hand-drawn animation aesthetic, soft watercolor backgrounds
- Natural environmental details, gentle expressions
- Organic shapes, warm natural lighting, atmospheric skies
- Lush vegetation, subtle textures, nostalgic atmosphere
- Magical realism, quiet everyday moments, emotional storytelling
- Focus on the beauty of ordinary life combined with subtle magic
- Typical environments: seaside train stations, rural Japanese villages, forest cabins, small cafés, countryside roads, summer festivals, lakeside towns, mountain homes`,
  userTemplate: `Generate a fresh image prompt for this scene.

SCENE CONTEXT
- Narration (DO NOT change): "{narration}"
- Niche: {niche}
- Style: Ghibli-Inspired

REQUIREMENTS
1. Cover every section: subject, action, environment (5–10 details), lighting, camera/composition, Ghibli characteristics, mood, quality/texture.
2. Pick a FRESH pastoral or small-town environment. Lean into the everyday beauty of small moments.
3. Be 30-60 words. Soft, organic language — describe natural light, gentle motion, weather, plants.
4. Do NOT include art-style words — the style will be applied automatically.

ENVIRONMENT BANK (pick one, vary across regenerations):
{environmentBank}

Return ONLY valid JSON:
{"prompt": "<your prompt here>"}`,
  negativeAvoid: [
    'cyberpunk',
    'noir',
    'grimdark',
    'high saturation neon',
    'photorealistic',
  ],
  environmentBank: [
    'seaside train station platform, small wooden station, cats on benches',
    'rural Japanese village at dawn, mist over rice paddies, wooden bridge',
    'forest cabin porch, hanging herbs, steaming teapot, birds at feeder',
    'small countryside café, wicker chairs, chalkboard menu, sunlight through window',
    'summer festival evening, paper lanterns, goldfish scoops, yukata crowd',
    'lakeside town dock at sunset, fishing boats, gulls, weathered wood',
    'mountain village inn, kotatsu, snow falling outside, hot tea',
    'old seaside library, tide pools visible through window, books on shelves',
    'family bakery kitchen at dawn, bread rising, copper bowls, soft golden light',
  ],
}

// ─── 7. LEGO ──────────────────────────────────────────────────────────────────
const lego: PromptStyleSpec = {
  key: 'lego',
  displayName: 'LEGO',
  aliases: ['lego', 'brick', 'minifigure', 'toy brick'],
  systemSnippet: `
- Authentic LEGO brick construction with visible studs and interlocking bricks
- LEGO minifigures, glossy plastic surfaces, modular architecture
- Toy-like proportions, bright colors, miniature details
- Brick-built environments, realistic plastic reflections, diorama composition
- Everything should look physically constructed from LEGO elements
- Typical environments: space stations, airports, fire stations, underwater laboratories, medieval castles, construction sites, cities, zoos, theme parks`,
  userTemplate: `Generate a fresh image prompt for this scene.

SCENE CONTEXT
- Narration (DO NOT change): "{narration}"
- Niche: {niche}
- Style: LEGO

REQUIREMENTS
1. Cover every section: subject, action, environment (5–10 details), lighting, camera/composition, LEGO characteristics, mood, quality/texture.
2. Pick a FRESH LEGO environment from the bank. Describe brick-built versions of locations.
3. Be 30-60 words. Mention studs, bricks, glossy plastic, minifigures explicitly.
4. Do NOT include art-style words — the style will be applied automatically.

ENVIRONMENT BANK (pick one, vary across regenerations):
{environmentBank}

Return ONLY valid JSON:
{"prompt": "<your prompt here>"}`,
  negativeAvoid: [
    'smooth painted surface',
    'no studs',
    'organic',
    'photorealistic',
  ],
  environmentBank: [
    'LEGO space station interior, transparent domes, minifigures floating',
    'LEGO airport terminal, planes on runway, control tower, baggage carts',
    'LEGO fire station, red trucks, ladders, training tower',
    'LEGO underwater research lab, glass domes, fish swimming outside',
    'LEGO medieval castle courtyard, drawbridge, knights, market stalls',
    'LEGO construction site, yellow cranes, hard-hat minifigures',
    'LEGO city downtown, skyscrapers, taxis, traffic lights',
    'LEGO zoo entrance, giraffe made of bricks, ticket booth',
    'LEGO theme park with roller coaster, cotton candy stand, ferris wheel',
  ],
}

// ─── 8. MODERN CARTOON ────────────────────────────────────────────────────────
const modernCartoon: PromptStyleSpec = {
  key: 'modern-cartoon',
  displayName: 'Modern Cartoon',
  aliases: ['cartoon', 'modern cartoon', 'cartoon network'],
  systemSnippet: `
- Clean bold outlines, simplified geometric forms
- Stylized proportions, expressive characters
- Playful facial expressions, smooth digital rendering
- Contemporary color palette, subtle cel shading
- Crisp edges, polished character design, modern animation aesthetic
- Keep it contemporary rather than vintage
- Typical environments: modern cities, rooftop gardens, coffee shops, schools, offices, shopping malls, beaches, parks, modern homes`,
  userTemplate: `Generate a fresh image prompt for this scene.

SCENE CONTEXT
- Narration (DO NOT change): "{narration}"
- Niche: {niche}
- Style: Modern Cartoon

REQUIREMENTS
1. Cover every section: subject, action, environment (5–10 details), lighting, camera/composition, modern cartoon characteristics, mood, quality/texture.
2. Pick a FRESH contemporary environment from the bank. Modern, not vintage.
3. Be 30-60 words. Describe the character with personality — body language matters.
4. Do NOT include art-style words — the style will be applied automatically.

ENVIRONMENT BANK (pick one, vary across regenerations):
{environmentBank}

Return ONLY valid JSON:
{"prompt": "<your prompt here>"}`,
  negativeAvoid: [
    'vintage',
    'sepia',
    'photorealistic',
    'rough sketch',
    'no outlines',
  ],
  environmentBank: [
    'rooftop garden cafe, succulent planters, string lights at dusk',
    'minimalist office with glass walls, sticky notes, laptop glow',
    'modern school hallway, lockers, backpacks, motivational posters',
    'shopping mall food court, neon signs, diverse crowd',
    'beach boardwalk at sunset, food trucks, arcade games, roller skates',
    'co-working space, hammocks between desks, ping-pong table',
    'subway station platform, digital schedules, commuter crowd',
    'modern art gallery, white walls, single dramatic sculpture',
    'startup office rooftop bar, string lights, city skyline behind',
  ],
}

// ─── 9. GREEK MYTHOLOGY ───────────────────────────────────────────────────────
const greekMythology: PromptStyleSpec = {
  key: 'greek-mythology',
  displayName: 'Greek Mythology',
  aliases: ['greek', 'greek mythology', 'olympus', 'olympian', 'mythology'],
  systemSnippet: `
- Olympian gods, titans, Greek heroes
- Ancient Greek temples, marble architecture, bronze armor, Greek robes
- Mythical creatures, divine symbols, classical Greek motifs
- Mediterranean landscapes, epic scale, divine lighting
- Mythological storytelling
- Possible subjects: Zeus, Athena, Poseidon, Apollo, Artemis, Hermes, Ares, Aphrodite, Hercules, Perseus, Medusa, Pegasus, Minotaur, Cerberus
- Possible environments: Mount Olympus, ancient Athens, Aegean coastline, temple courtyards, the Underworld, labyrinths, ancient battlefields, divine palaces
- Do NOT use Indian mythology unless specifically asked`,
  userTemplate: `Generate a fresh image prompt for this scene.

SCENE CONTEXT
- Narration (DO NOT change): "{narration}"
- Niche: {niche}
- Style: Greek Mythology

REQUIREMENTS
1. Cover every section: subject, action, environment (5–10 details), lighting, camera/composition, Greek mythology characteristics, mood, quality/texture.
2. Pick a FRESH Greek environment from the bank. Avoid the cliché "dark battlefield" — vary.
3. Be 30-60 words. Lean into the classical: marble, columns, divine light, mythological symbols.
4. Do NOT include art-style words — the style will be applied automatically.

ENVIRONMENT BANK (pick one, vary across regenerations):
{environmentBank}

Return ONLY valid JSON:
{"prompt": "<your prompt here>"}`,
  negativeAvoid: [
    'modern clothing',
    'technology',
    'casual',
    'photorealistic',
  ],
  environmentBank: [
    'sun-drenched Mount Olympus marble courtyard, columns, distant clouds',
    'Aegean harbor at dawn, blue-domed temple, fishing boats, whitewashed walls',
    'underground labyrinth, torchlit walls, bronze door, minotaur shadows',
    'temple of Athena, marble columns, olive trees, owls on capitals',
    'divine palace throne room, gold and ivory throne, peacock feathers',
    'river Styx ferry crossing, mist, lanterns on dark water',
    'Olympian council chamber, geometric floor, gods seated in semicircle',
    'ancient agora marketplace, philosophers, mosaic floor, sunlit columns',
    'Hephaestus forge, volcanic light, bronze shields on walls',
  ],
}

// ─── 10. PIXEL ART ────────────────────────────────────────────────────────────
const pixelArt: PromptStyleSpec = {
  key: 'pixel-art',
  displayName: 'Pixel Art',
  aliases: ['pixel', 'pixel art', '8-bit', '16-bit', 'retro game', 'sprite'],
  systemSnippet: `
- Pixel-by-pixel construction, crisp hard-edged pixels
- Limited color palette, intentional pixel clusters
- Pixel shading, dithering, retro sprites
- 8-bit, 16-bit, or 32-bit aesthetics
- Layered game backgrounds, strong silhouettes
- No smooth vector edges
- Typical environments: arcade rooms, RPG villages, space stations, farming towns, cyberpunk streets, fantasy castles, racing tracks, underwater levels
- Specify the era where appropriate: "16-bit RPG aesthetic" or "32-bit pixel-art game aesthetic"`,
  userTemplate: `Generate a fresh image prompt for this scene.

SCENE CONTEXT
- Narration (DO NOT change): "{narration}"
- Niche: {niche}
- Style: Pixel Art

REQUIREMENTS
1. Cover every section: subject, action, environment (5–10 details), lighting, camera/composition, pixel art characteristics, mood, quality/texture.
2. Pick a FRESH game-world environment. Specify the pixel-art era (8-bit, 16-bit, 32-bit).
3. Be 30-60 words. Mention "dithering", "limited palette", "pixel clusters", "silhouette" — the visual mechanics that make pixel art.
4. Do NOT include art-style words — the style will be applied automatically.

ENVIRONMENT BANK (pick one, vary across regenerations):
{environmentBank}

Return ONLY valid JSON:
{"prompt": "<your prompt here>"}`,
  negativeAvoid: [
    'smooth gradients',
    'anti-aliased curves',
    'photorealistic',
    'vector art',
    'high resolution',
  ],
  environmentBank: [
    '16-bit RPG village tavern, wooden tables, NPCs at the bar, lantern glow',
    'arcade room with neon cabinets, carpet floor, teenager silhouettes',
    'farming town at dusk, crop fields, pixel chickens, wooden farmhouse',
    'cyberpunk city street, neon signs, dithered rain reflections',
    'fantasy castle throne room, red carpet, knight sprites, stained glass',
    'underwater coral level, swimming fish sprites, blue dither gradient',
    'racing track with checkered flag, pixel crowd cheering, mountain backdrop',
    'space station corridor, blinking lights, airlock doors',
    'haunted mansion entry hall, dithered fog, portrait eyes that follow',
  ],
}

// ─── 11. CLASSICAL PAINTING ───────────────────────────────────────────────────
const classicalPainting: PromptStyleSpec = {
  key: 'classical-painting',
  displayName: 'Classical Painting',
  aliases: ['classical', 'painting', 'oil painting', 'renaissance', 'baroque'],
  systemSnippet: `
- Oil-on-canvas appearance, visible brushstrokes
- Layered pigments, rich colors
- Natural lighting, realistic anatomy
- Painterly textures, classical composition
- Atmospheric perspective, museum-quality finish
- Traditional painting aesthetic
- Typical environments: European marketplaces, royal courts, countryside, seaside villages, historical interiors, gardens, portrait studios, agricultural landscapes`,
  userTemplate: `Generate a fresh image prompt for this scene.

SCENE CONTEXT
- Narration (DO NOT change): "{narration}"
- Niche: {niche}
- Style: Classical Painting

REQUIREMENTS
1. Cover every section: subject, action, environment (5–10 details), lighting, camera/composition, classical painting characteristics, mood, quality/texture.
2. Pick a FRESH historical setting. Mention canvas, brushwork, pigment where it adds.
3. Be 30-60 words. Lean into painterly vocabulary: chiaroscuro, impasto, glazing.
4. Do NOT include art-style words — the style will be applied automatically.

ENVIRONMENT BANK (pick one, vary across regenerations):
{environmentBank}

Return ONLY valid JSON:
{"prompt": "<your prompt here>"}`,
  negativeAvoid: [
    'digital noise',
    'photographic grain',
    'modern technology',
    'cgi',
    'vector clean edges',
  ],
  environmentBank: [
    'sun-drenched European marketplace, stalls of fruit, linen awnings',
    'royal court interior, gilded mirrors, marble floors, candlelight',
    'Italian countryside at golden hour, cypress trees, harvest wagons',
    'seaside Mediterranean village, whitewashed walls, fishing nets',
    'grand palace library, leather-bound books, oil lamp, vaulted ceiling',
    'formal garden at Versailles, geometric hedges, marble fountain',
    '17th-century portrait studio, velvet drapes, single window light',
    'rural Dutch landscape, windmill, canal, painted clouds',
    'Florentine workshop, easel, painter at work, jars of pigment',
  ],
}

// ─── 12. POLAROID / INSTANT FILM ──────────────────────────────────────────────
const polaroid: PromptStyleSpec = {
  key: 'polaroid',
  displayName: 'Polaroid / Instant Film',
  aliases: ['polaroid', 'instant', 'instant film', 'film', 'analog'],
  systemSnippet: `
- Authentic instant-film appearance, slightly faded colors
- Film grain, soft focus, natural exposure imperfections
- Light leaks, subtle vignette, washed highlights
- Analog texture, candid composition, nostalgic atmosphere
- Realistic photography — feels like a genuine photograph someone actually took
- Avoid making it look digitally perfect
- Typical subjects: friends, couples, road trips, family gatherings, camping, parties, vacations, everyday moments`,
  userTemplate: `Generate a fresh image prompt for this scene.

SCENE CONTEXT
- Narration (DO NOT change): "{narration}"
- Niche: {niche}
- Style: Polaroid / Instant Film

REQUIREMENTS
1. Cover every section: subject, action, environment (5–10 details), lighting, camera/composition, polaroid characteristics, mood, quality/texture.
2. Pick a FRESH candid moment from the bank — every day, intimate, real.
3. Be 30-60 words. Lean into the snapshot aesthetic — imperfect, candid, real.
4. Do NOT include art-style words — the style will be applied automatically.

ENVIRONMENT BANK (pick one, vary across regenerations):
{environmentBank}

Return ONLY valid JSON:
{"prompt": "<your prompt here>"}`,
  negativeAvoid: [
    'digital perfection',
    'studio lighting',
    'posed portrait',
    'high definition',
    'clean digital edges',
  ],
  environmentBank: [
    'mountain campsite at dusk, friends around a fire, sleeping bags in foreground',
    'road trip diner booth, two friends laughing, neon signs through window',
    'birthday party kitchen, balloons mid-air, cake on counter',
    'beach bonfire at night, silhouettes dancing, warm flash glow on faces',
    'rainy apartment window, couple watching storm, reflections in glass',
    'park picnic, kids running, checkered blanket, slight motion blur',
    'late-night diner counter, single cup of coffee, neon outside',
    'family porch, dog mid-jump, sun-faded wood, snapshot composition',
    'amusement park at twilight, ferris wheel lights, couple on bench',
  ],
}

// ─── 13. PHOTOREALISM / REALISM ──────────────────────────────────────────────
const photorealism: PromptStyleSpec = {
  key: 'photorealism',
  displayName: 'Photorealism / Realism',
  aliases: ['realism', 'photorealism', 'realistic', 'photograph', 'photo'],
  systemSnippet: `
- Physically accurate anatomy, realistic skin texture
- Natural imperfections, individual hair strands, accurate materials
- Realistic lighting, physically accurate shadows
- Natural reflections, realistic depth of field
- Lens characteristics, documentary or professional photography
- Natural color reproduction, high dynamic range
- Avoid: illustration, cartoon appearance, plastic-looking skin, unrealistic anatomy, excessive artificial effects
- Possible environments (any realistic setting): research laboratories, restaurants, beaches, offices, sports events, hospitals, construction sites, markets, mountains, streets`,
  userTemplate: `Generate a fresh image prompt for this scene.

SCENE CONTEXT
- Narration (DO NOT change): "{narration}"
- Niche: {niche}
- Style: Photorealism / Realism

REQUIREMENTS
1. Cover every section: subject, action, environment (5–10 details), lighting, camera/composition, photorealism characteristics, mood, quality/texture.
2. Pick a FRESH realistic environment. Vary across regenerations.
3. Be 30-60 words. Lean into real-world details: skin pores, fabric weave, natural light falloff.
4. Do NOT include art-style words — the style will be applied automatically.

ENVIRONMENT BANK (pick one, vary across regenerations):
{environmentBank}

Return ONLY valid JSON:
{"prompt": "<your prompt here>"}`,
  negativeAvoid: [
    'cartoon',
    'illustration',
    'plastic skin',
    'flat lighting',
    'anime',
  ],
  environmentBank: [
    'modern hospital corridor at night, fluorescent lights, nurses walking',
    'open-plan office with floor-to-ceiling windows, late afternoon sun',
    'rooftop restaurant at dusk, candle on table, city skyline behind',
    'subway platform at rush hour, commuters, motion blur',
    'coastal cliffside at sunset, salt spray, single lighthouse',
    'research laboratory, scientist at microscope, blue LED glow',
    'modern supermarket aisle, fluorescent lighting, shopping carts',
    'construction site at sunrise, crane silhouette, hard-hat workers',
    'city crosswalk at night, neon reflections on wet pavement',
  ],
}

// ─── Registry ────────────────────────────────────────────────────────────────
export const PROMPT_STYLES: PromptStyleSpec[] = [
  comicBook,
  creepyComic,
  anime,
  darkFantasy,
  disneyFairytale,
  ghibli,
  lego,
  modernCartoon,
  greekMythology,
  pixelArt,
  classicalPainting,
  polaroid,
  photorealism,
]

export const PROMPT_STYLES_BY_KEY: Record<string, PromptStyleSpec> =
  Object.fromEntries(PROMPT_STYLES.map(s => [s.key, s]))

// ─── Style matcher ──────────────────────────────────────────────────────────
// Resolves the spec for an ArtStyle.name (e.g. "Creepy Comic" or
// "Photorealism"). Falls back to photorealism if nothing matches.
export function matchStyleSpec(artStyleName: string | null | undefined): PromptStyleSpec {
  const name = (artStyleName || '').toLowerCase().trim()
  if (!name) return photorealism

  // Exact alias match first
  for (const spec of PROMPT_STYLES) {
    if (spec.aliases.some(a => a.toLowerCase() === name)) return spec
  }
  // Display-name match
  for (const spec of PROMPT_STYLES) {
    if (spec.displayName.toLowerCase() === name) return spec
  }
  // Substring match (longest alias wins)
  let best: PromptStyleSpec | null = null
  let bestLen = 0
  for (const spec of PROMPT_STYLES) {
    for (const alias of spec.aliases) {
      const a = alias.toLowerCase()
      if (name.includes(a) && a.length > bestLen) {
        best = spec
        bestLen = a.length
      }
    }
  }
  if (best) return best

  return photorealism
}

// ─── User-prompt template filler ─────────────────────────────────────────────
function fillEnvBank(spec: PromptStyleSpec, seed: number): string {
  // Pseudo-random but deterministic per seed so consecutive regenerations
  // get DIFFERENT environments. Seed should include topic id + a counter.
  const envs = spec.environmentBank
  const start = seed % envs.length
  // Show 4 options, rotating from the start
  const selected: string[] = []
  for (let i = 0; i < 4; i++) {
    selected.push(envs[(start + i) % envs.length])
  }
  return selected.map((e, i) => `  ${i + 1}. ${e}`).join('\n')
}

export interface BuildUserPromptInput {
  narration: string
  niche: string
  seed?: number  // different seed → different env bank rotation
}

export function buildSceneUserPrompt(spec: PromptStyleSpec, input: BuildUserPromptInput): string {
  const seed = input.seed ?? Date.now()
  const envBank = fillEnvBank(spec, seed)
  return spec.userTemplate
    .replace(/{narration}/g, input.narration)
    .replace(/{niche}/g, input.niche)
    .replace(/{environmentBank}/g, envBank)
}

// ─── System prompt assembler ─────────────────────────────────────────────────
export function buildSceneSystemPrompt(spec: PromptStyleSpec, niche: string): string {
  return `You are an expert AI image-prompt designer for ${niche} YouTube videos.

# Subject anchoring (most important)
The narration describes the scene. The prompt you write MUST depict exactly what the narration says — same subject, same action, same location. Never invent or borrow from elsewhere.

# Output format (strict)
Return ONLY valid JSON: {"prompt": "<scene description>"}.

Write the prompt as 7 sentences, one per section, in this order:
1. SUBJECT + ACTION — who/what + their motion, in ONE sentence. Specify age, clothing, expression.
2. COMPOSITION HIERARCHY — "Foreground: X; midground: Y; background: Z."
3. ENVIRONMENT — 5–10 tangible details with spatial placement. ONE sentence.
4. LIGHTING — source + effect on the scene. ONE sentence.
5. FRAMING — ONE explicit shot type (close-up, wide, low-angle).
6. MOOD — create mood visually through body language, framing, lighting. ONE sentence. No flat adjectives.
7. QUALITY — material textures, atmospheric depth, fine grain. ONE sentence.

Total: 60-100 words, 7 sentences. NO style words — the style is appended server-side.

# Hard rules
- DO NOT include art-style words (the style is appended automatically).
- DO NOT merge sections via comma lists — each section is its own sentence.
- DO NOT use "wrong faces" / "distorted" — describe the desired effect instead.
- DO NOT use place-name adjectives ("Shanghai teen") unless they specify a visual feature ("teenage girl in a contemporary Shanghai school uniform").
- DO NOT write a flat mood word ("Tense.") — describe HOW the scene conveys mood.
- Avoid blurry anatomy, extra fingers, text/watermarks.

# Example
Narration: "a pale girl holds a cracked doll in a flooded basement"
Good: "A teenage girl in a contemporary school uniform crouches in a flooded basement rec room, holding a cracked porcelain doll. Foreground: water-stained board game pieces float in murky water; midground: the girl examines the doll with an unnervingly calm expression; background: waterlogged toys drift past submerged furniture. Around her, peeling wallpaper curls from damp walls, a vinyl record player sits half-submerged, a single bare bulb swings overhead casting long distorted shadows. Harsh overhead light from the single swinging bulb creates stark pools of light and deep darkness. Low-angle medium shot emphasizing the girl's isolation. Eerie calm amid decay; the girl's stillness contrasts with floating debris. Fine water droplets, subtle film grain, textured water surface."
Bad: "<STYLE>, dark ink, creepy. Girl with doll, flooded basement, water, peeling walls, low-angle. Moody."

Return ONLY the JSON.`
}

// ─── Convenience: build both ────────────────────────────────────────────────
export function buildScenePrompts(artStyleName: string, input: BuildUserPromptInput): {
  system: string
  user: string
  spec: PromptStyleSpec
} {
  const spec = matchStyleSpec(artStyleName)
  return {
    system: buildSceneSystemPrompt(spec, input.niche),
    user: buildSceneUserPrompt(spec, input),
    spec,
  }
}
