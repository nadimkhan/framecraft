/**
 * Seed script for predefined niches, art styles, voice styles, music, effects
 * Run: npx tsx prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seed() {
  console.log('Seeding database...')

  // === EFFECTS ===
  const effects = [
    { name: 'Zoom In', slug: 'zoom-in', description: 'Gradual zoom from 1x to 1.25x', promptHint: 'with zoom in effect', remotionType: 'zoom-in' },
    { name: 'Zoom Out', slug: 'zoom-out', description: 'Gradual zoom out from 1.2x to 1x', promptHint: 'with zoom out effect', remotionType: 'zoom-out' },
    { name: 'Pan Left', slug: 'pan-left', description: 'Camera pans left with slight zoom', promptHint: 'camera panning left', remotionType: 'pan-left' },
    { name: 'Pan Right', slug: 'pan-right', description: 'Camera pans right with slight zoom', promptHint: 'camera panning right', remotionType: 'pan-right' },
    { name: 'Pan Up', slug: 'pan-up', description: 'Camera pans up with slight zoom', promptHint: 'camera panning upward', remotionType: 'pan-up' },
    { name: 'Pan Down', slug: 'pan-down', description: 'Camera pans down with slight zoom', promptHint: 'camera panning downward', remotionType: 'pan-down' },
    { name: 'Ken Burns', slug: 'ken-burns', description: 'Classic documentary: slow zoom + pan across image', promptHint: 'ken burns effect', remotionType: 'ken-burns' },
    { name: 'Spiral Zoom', slug: 'spiral-zoom', description: 'Zoom with subtle rotation', promptHint: 'spiral zoom effect', remotionType: 'spiral-zoom' },
    { name: 'Pulse Breathe', slug: 'pulse-breathe', description: 'Rhythmic breathing/pulsing effect', promptHint: 'breathing pulse effect', remotionType: 'pulse-breathe' },
    { name: 'Drift Diagonal', slug: 'drift-diagonal', description: 'Smooth diagonal drift across image', promptHint: 'diagonal drift effect', remotionType: 'drift-diagonal' },
    { name: 'Focus Pull', slug: 'focus-pull', description: 'Cinematic focus pull: zoom in then out', promptHint: 'cinematic focus pull', remotionType: 'focus-pull' },
    { name: 'Orbit Light', slug: 'orbit-light', description: 'Orbital movement around center point', promptHint: 'orbital light movement', remotionType: 'orbit-light' },
    { name: 'Slow Scan', slug: 'slow-scan', description: 'Slow horizontal scan line effect', promptHint: 'slow scan effect', remotionType: 'slow-scan' },
    { name: 'Glitch', slug: 'glitch', description: 'Digital glitch distortion', promptHint: 'glitch distortion', remotionType: 'glitch' },
    { name: 'Vignette Fade', slug: 'vignette-fade', description: 'Dark edges fading in/out', promptHint: 'vignette fade', remotionType: 'vignette-fade' },
    { name: 'Parallax', slug: 'parallax', description: 'Multi-layer depth parallax', promptHint: 'parallax depth effect', remotionType: 'parallax' },
  ]

  for (const eff of effects) {
    await prisma.effect.upsert({
      where: { slug: eff.slug },
      update: {},
      create: eff,
    })
  }
  console.log(`✓ ${effects.length} effects seeded`)

  // === ART STYLES ===
  // Each style has a distinctive previewPrompt that describes a unique subject
  // and scene specific to that style (NOT the same hero repeated). Built around
  // a cinematic subject + atmospheric details + style-specific art-direction
  // terminology + 4K rendering hint.
  const artStyles = [
    { name: 'Comic', slug: 'comic', description: 'Bold outlines, flat colors, classic comic book look', promptSuffix: ', comic book style, vibrant colors, bold outlines, flat shading, halftone dots', examplePrompt: 'a warrior standing on a cliff, comic book style', previewPrompt: 'A fearless female superhero standing on the rooftop of a futuristic skyscraper during a violent thunderstorm, her cape blowing dramatically in the wind as lightning strikes behind her, overlooking a sprawling neon-lit city at night. She has an intense determined expression, dynamic heroic pose, detailed futuristic armor, glowing energy symbols on her gauntlets, rain droplets and wind-blown debris surrounding her. **Classic high-end comic book art style**, bold black ink outlines, expressive linework, dramatic foreshortening, strong cel shading, vivid colors, deep shadows, cinematic lighting, halftone dot textures, detailed hand-inked artwork, dynamic perspective, graphic novel composition, highly detailed background, powerful visual storytelling, professional comic book cover quality, sharp crisp details, 4K.' },
    { name: 'Creepy Comic', slug: 'creepy-comic', description: 'Dark horror comics, black ink, unsettling atmosphere', promptSuffix: ', creepy horror comic style, dark ink, unsettling atmosphere', examplePrompt: 'a shadowy figure in a dark forest, creepy horror comic style', previewPrompt: 'A gaunt, hollow-eyed woman in a tattered 19th-century funeral gown crawling out of an open grave in a fog-drenched cemetery, her fingers clawing through cold wet earth, decayed gravestones tilting at crooked angles behind her, twisted bare trees clawing at a sickly yellow moon. Her sunken face is half skeletal, jaw dislocated, black tears streaking down sunken cheeks. **Vintage EC horror comic panel style**, heavy black ink crosshatching, scratchy pen linework, dramatic chiaroscuro shadows, stark white highlights on bone, dense Ben-Day dots, aged yellowed paper texture, graphic novel composition, dark atmospheric background, unsettling horror storytelling, 4K detail.' },
    { name: 'Modern Cartoon', slug: 'modern-cartoon', description: 'Contemporary animated series look', promptSuffix: ', modern cartoon style, clean lines, vibrant', examplePrompt: 'a robot in a city, modern cartoon style', previewPrompt: 'A friendly neon-blue robot barista cheerfully serving coffee to a diverse crowd of humans and aliens at a busy futuristic sidewalk café, robotic arms juggling espresso cups mid-air, steam rising in heart shapes, holographic menu boards floating overhead, colorful bustling street with hover-cars and palm trees. Clean bold lineart, flat saturated tropical colors, smooth gradient sky, modern 2D animation cel style, expressive squash-and-stretch poses, charming character design, crisp vector-sharp edges, vibrant lighting, contemporary cartoon aesthetic, 4K.' },
    { name: 'Disney', slug: 'disney', description: 'Magical Disney-inspired animation style', promptSuffix: ', Disney animation style, magical, elegant, whimsical', examplePrompt: 'a castle on a hill, Disney style', previewPrompt: 'An elegant young princess with flowing golden hair and a sparkling blue ballgown dancing with her prince in a grand moonlit ballroom, rose petals drifting from the vaulted ceiling, magical golden fairy dust swirling around them, ornate chandeliers casting warm amber light, marble pillars wrapped in climbing roses. Soft volumetric lighting, dreamy pastel sky tones, Disney animation aesthetic with rich character emotion in their eyes, painterly background, whimsical magical atmosphere, elegant romantic composition, gentle warm color palette, 4K detail.' },
    { name: 'Mythology', slug: 'mythology', description: 'Ancient mythology and epic god imagery', promptSuffix: ', ancient mythology style, epic, divine, classical art', examplePrompt: 'Zeus holding a lightning bolt, mythology art style', previewPrompt: 'A bearded Greek god in flowing white marble robes wielding a crackling thunderbolt above storm clouds on Mount Olympus, marble columns of an ancient temple behind him, golden divine light bursting from his chest, eagles circling overhead, lesser gods watching from temple steps, carved reliefs on the temple walls showing past battles. **Classical Greek mythology oil painting**, heroic figure composition, dramatic foreshortening, rich golds and deep ultramarine blues, atmospheric perspective, divine light rays, oil on canvas texture, epic scale, romanticism style, 4K detail.' },
    { name: 'Pixel Art', slug: 'pixel-art', description: 'Retro 8-bit and 16-bit video game style', promptSuffix: ', pixel art style, 8-bit, retro game', examplePrompt: 'a dragon flying over mountains, pixel art style', previewPrompt: 'A tiny pixelated hero standing at the entrance of a vast dark dungeon mouth carved into a misty mountainside, a flickering torch in one hand casting warm orange light across cracked stone steps, ancient runes glowing faintly purple on the doorframe, a massive shadowy figure barely visible deep inside, distant pixelated stars in the night sky above. **16-bit retro JRPG game style**, hard-edged individual pixels clearly visible, no anti-aliasing, limited 64-color palette, dithered shading on the sky gradient, large readable sprite, dark fantasy aesthetic, retro game key art, 4K resolution preserved as crisp pixel grid.' },
    { name: 'Ghibli', slug: 'ghibli', description: 'Studio Ghibli hand-drawn animation aesthetic', promptSuffix: ', Studio Ghibli animation style, hand-drawn, magical realism', examplePrompt: 'a girl running through a field of flowers, Ghibli style', previewPrompt: 'An elderly bus mechanic sitting on the porch of his countryside workshop at golden hour, sharing tea and rice crackers with a small forest spirit who has just climbed down from the giant camphor tree behind him, soft wind rustling the leaves, tiny soot sprites peeking from behind an old oil drum in the yard, distant rolling green hills with scattered farmhouses under a watercolor sky. **Studio Ghibli hand-drawn animation style**, soft pastel watercolor palette, gentle natural lighting, detailed pastoral background, peaceful magical realism atmosphere, expressive character acting, traditional Japanese countryside aesthetic, warm nostalgic mood, 4K detail.' },
    { name: 'Anime', slug: 'anime', description: 'Japanese anime with bold linework and vivid colors', promptSuffix: ', anime style, vibrant, bold linework, Japanese animation', examplePrompt: 'a ninja perched on a rooftop at night, anime style', previewPrompt: 'A 17-year-old sword-wielding heroine in a futuristic cyberpunk Tokyo alley at midnight, mid-leap over a flooded puddle reflecting neon signs in magenta and cyan, her long silver hair streaming behind her, dual katanas drawn and trailing blue plasma arcs, holographic kanji symbols exploding in the air around her, rain drenching her leather jacket. **High-end anime key visual style**, bold cel-shaded linework, dramatic speed lines, intense expressive eyes with detailed iris reflections, vivid saturated color palette, dynamic motion blur, Japanese animation aesthetic, sharp details, 4K.' },
    { name: 'Painting', slug: 'painting', description: 'Classical oil painting or digital painting', promptSuffix: ', digital painting, cinematic lighting, highly detailed', examplePrompt: 'a stormy sea with ships, digital painting style', previewPrompt: 'A weathered wooden galleon caught in a violent towering storm at twilight, massive purple-gray cumulonimbus clouds lit from within by golden lightning, a glimpse of distant safe harbor through a break in the spray, crew members battling the wheel on the deck, ropes snapping in the gale, masts creaking at dangerous angles. **Classical maritime oil painting style**, visible impasto brushstrokes, dramatic chiaroscuro lighting, rich glazed shadows, golden hour light piercing through storm clouds, traditional Dutch Golden Age maritime composition, painterly texture, atmospheric perspective, museum-quality realism, 4K detail.' },
    { name: 'Dark Fantasy', slug: 'dark-fantasy', description: 'Gothic dark fantasy, monsters, ancient ruins', promptSuffix: ', dark fantasy art, gothic, eerie, ancient ruins', examplePrompt: 'a demon emerging from a dark temple, dark fantasy art', previewPrompt: 'A horned demon lord sitting on a throne of twisted human bones inside a flooded forgotten cathedral, ten thousand candle flames floating in the air around him casting sickly green light, blood-red moon visible through the shattered stained-glass window above, hooded cultists kneeling in the foreground holding ritual daggers, writhing shadows on the cracked stone walls. **Gothic dark fantasy digital painting**, sickly green and deep crimson color palette, dramatic god-rays cutting through dust and incense smoke, intricate bone-carved architecture, disturbing yet beautiful, atmospheric fog, eerie ambient sound visualized, 4K detail.' },
    { name: 'Lego', slug: 'lego', description: 'Lego brick-built scene, plastic textured', promptSuffix: ', Lego bricks style, plastic texture, toy-like, colorful', examplePrompt: 'a city skyline made of Lego bricks', previewPrompt: 'A tiny Lego minifigure astronaut floating in zero gravity outside a Lego-brick space station orbiting a Lego-built planet, colorful Lego studs and tubes visible on every surface, the astronaut tethered to the station by a translucent blue Lego chain, distant Lego stars and a Lego crescent moon in the starry plastic-textured cosmos, tiny Lego rocket exhaust plumes from the station engines. **Lego bricks photography style**, slightly glossy ABS plastic texture, vibrant primary colors, classic studded brick construction, soft studio product-shot lighting, slight shallow depth of field, child-like wonder, 4K detail.' },
    { name: 'Polaroid', slug: 'polaroid', description: 'Instant film Polaroid photo aesthetic', promptSuffix: ', Polaroid instant photo, vintage, white border', examplePrompt: 'a sunset beach scene, Polaroid photo style', previewPrompt: 'A candid Polaroid photo of a mother and her young daughter laughing together on a worn kitchen linoleum floor, both covered in flour while baking bread, daughter in a pink apron with frosting on her nose, golden late-afternoon window light pouring in from the right illuminating their hair, scattered cookie cutters and a rolling pin on the floor, slight motion blur on the mother\'s hand mid-gesture. **Authentic Polaroid SX-70 instant photo**, slightly faded warm color cast, characteristic light leak bleeding in from top-right corner, soft focus around edges, chunky white Polaroid border with handwritten caption space at bottom, analog film grain, slightly under-exposed shadows, nostalgic 1978 home photography, 4K detail.' },
    { name: 'Realism', slug: 'realism', description: 'Photorealistic, lifelike detail', promptSuffix: ', photorealistic, hyperrealistic, lifelike detail', examplePrompt: 'a realistic wolf in a forest, photorealistic', previewPrompt: 'A weathered 70-year-old Japanese sushi chef standing in his small wooden 6-seat sushi counter at dawn, hands carefully forming nigiri with a slice of fresh tuna glistening in the morning light, steam rising from a pot of rice behind him, worn wooden cutting board with decades of knife marks, hanging noren curtain with kanji in the doorway behind him, single warm pendant light illuminating the workspace, his weathered hands the focal point. **Hyperrealistic documentary photography**, Canon EOS R5 with 85mm f/1.4 lens, shallow depth of field, natural ambient lighting, fine skin texture detail, every grain of rice visible, photojournalistic composition, 4K.' },
    { name: 'Fantasy', slug: 'fantasy', description: 'High fantasy, magic, elves, dragons', promptSuffix: ', high fantasy art, magical, epic, mystical', examplePrompt: 'a wizard casting a spell in a enchanted forest, fantasy art', previewPrompt: 'An elven sorceress in flowing silver robes standing on a floating crystal platform high above a misty emerald valley, a massive ancient gold-and-emerald dragon coiling protectively around her, the dragon\'s scales catching the sunrise, magical runes orbiting both figures in glowing spirals, distant snow-capped mountains and tiny villages in the valley below visible through gaps in the morning fog. **High fantasy oil painting in the style of a Frazetta cover**, sweeping cinematic composition, rich emerald-and-gold color palette, dramatic god-rays, painterly atmosphere, intricate detail in dragon scales and elven armor, magical particles, epic grand-scale storytelling, 4K detail.' },
  ]



  for (const style of artStyles) {
    // Use previewPrompt (the rich style-specific prompt) for thumbnail generation.
    await prisma.artStyle.upsert({
      where: { slug: style.slug },
      update: { previewPrompt: style.previewPrompt, examplePrompt: style.examplePrompt },
      create: { ...style },
    })
  }
  console.log(`✓ ${artStyles.length} art styles seeded`)

  // === VOICE STYLES (Azure Neural voices) ===
  // sampleAudioUrl uses Azure's official voice sample library — these are
  // the canonical demo clips Microsoft ships with each Neural voice.
  // See: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-samples
  const voiceStyles = [
    { name: 'Jenny (Female, Friendly)', slug: 'jenny', azureVoiceName: 'en-US-JennyNeural', description: 'Warm, friendly female voice', tags: ['female', 'friendly', 'calm'], sampleAudioUrl: 'https://aka.ms/csspeech/samples/en-US-JennyNeural.wav', sampleText: 'Hello! My name is Jenny, and I can be your video narrator with a warm, friendly tone.' },
    { name: 'Aria (Female, Professional)', slug: 'aria', azureVoiceName: 'en-US-AriaNeural', description: 'Professional female voice for news and narration', tags: ['female', 'professional', 'narration'], sampleAudioUrl: 'https://aka.ms/csspeech/samples/en-US-AriaNeural.wav', sampleText: 'Greetings. I am Aria, ready to deliver your content with clarity and precision.' },
    { name: 'Jenny (British Female)', slug: 'jenny-gb', azureVoiceName: 'en-GB-SoniaNeural', description: 'British female voice', tags: ['female', 'british', 'calm'], sampleAudioUrl: 'https://aka.ms/csspeech/samples/en-GB-SoniaNeural.wav', sampleText: 'Hello there. I am Sonia, a British voice, perfect for sophisticated narration.' },
    { name: 'Guy (Male, Professional)', slug: 'guy', azureVoiceName: 'en-US-GuyNeural', description: 'Professional American male voice', tags: ['male', 'professional', 'energetic'], sampleAudioUrl: 'https://aka.ms/csspeech/samples/en-US-GuyNeural.wav', sampleText: 'Hi, I am Guy. I bring a professional and energetic tone to your video content.' },
    { name: 'Davis (Male, Calm)', slug: 'davis', azureVoiceName: 'en-US-DavisNeural', description: 'Calm male voice, good for tutorials', tags: ['male', 'calm', 'tutorial'], sampleAudioUrl: 'https://aka.ms/csspeech/samples/en-US-DavisNeural.wav', sampleText: 'Hello, I am Davis. I narrate calmly and clearly, ideal for tutorials and explainers.' },
    { name: 'Roger (Male, Young)', slug: 'roger', azureVoiceName: 'en-US-RogerNeural', description: 'Young energetic male voice', tags: ['male', 'young', 'energetic'], sampleAudioUrl: 'https://aka.ms/csspeech/samples/en-US-RogerNeural.wav', sampleText: 'Hey! I am Roger, a young energetic voice perfect for upbeat content.' },
    { name: 'Sara (Female, Animated)', slug: 'sara', azureVoiceName: 'en-US-SaraNeural', description: 'Animated expressive female voice', tags: ['female', 'expressive', 'animated'], sampleAudioUrl: 'https://aka.ms/csspeech/samples/en-US-SaraNeural.wav', sampleText: 'Hi there! I am Sara, with an animated and expressive style for engaging content.' },
    { name: 'Tony (Male, Deep)', slug: 'tony', azureVoiceName: 'en-US-TonyNeural', description: 'Deep male voice, authoritative', tags: ['male', 'deep', 'authoritative'], sampleAudioUrl: 'https://aka.ms/csspeech/samples/en-US-TonyNeural.wav', sampleText: 'Hello. I am Tony. My deep authoritative voice is perfect for serious storytelling.' },
  ]

  for (const voice of voiceStyles) {
    await prisma.voiceStyle.upsert({
      where: { slug: voice.slug },
      update: {
        // Re-populate the sample URLs on re-seed (they were missing in older seeds)
        sampleAudioUrl: voice.sampleAudioUrl,
        sampleText: voice.sampleText,
      },
      create: voice,
    })
  }
  console.log(`✓ ${voiceStyles.length} voice styles seeded`)

  // === NICHE PRESETS (for future expansion — custom niches stored by user) ===
  const niches = [
    {
      category: 'Horror',
      slug: 'horror',
      description: 'Horror shorts, scary stories, jump scares, creepy narratives',
    },
    {
      category: 'Motivation',
      slug: 'motivation',
      description: 'Inspirational quotes, personal growth, success mindset',
    },
    {
      category: 'Comedy',
      slug: 'comedy',
      description: 'Funny moments, jokes, humor compilation content',
    },
    {
      category: 'Gaming',
      slug: 'gaming',
      description: 'Game clips, gaming moments, esports highlights',
    },
    {
      category: 'Finance',
      slug: 'finance',
      description: 'Bitcoin, DeFi, trading tips, blockchain news',
    },
  ]



  for (const niche of niches) {
    const nicheData = niche
    await prisma.niche.upsert({
      where: { slug: niche.slug },
      update: {},
      create: nicheData,
    })
  }
  console.log(`✓ ${niches.length} niches seeded`)

  // === BACKGROUND MUSIC ===
  // Auto-discover files in public/audio/music/ and seed one DB row per file.
  // Categorizes by filename keywords. Files without a recognized category are skipped.
  const fs = await import('fs/promises')
  const MUSIC_DIR = new URL('../public/audio/music/', import.meta.url).pathname

  function categorizeMusic(fname: string): string | null {
    const lower = fname.toLowerCase()
    if (/horror|eerie|dark/.test(lower)) return 'horror'
    if (/epic|cinematic/.test(lower)) return 'epic'
    if (/action|sigmamusic/.test(lower)) return 'action'
    if (/calm|uplifting/.test(lower)) return 'calm'
    if (/funny|comedy/.test(lower)) return 'comedy'
    if (/motivational|inspirational|soulful|dreamy/.test(lower)) return 'motivational'
    if (/mysterious|tension/.test(lower)) return 'mystery'
    if (/miromax|tech/.test(lower)) return 'tech'
    if (/hitslab/.test(lower)) return 'rock'
    return null
  }
  function displayName(fname: string): string {
    return fname
      .replace(/\\.[^.]+$/, '')
      .replace(/[-_]/g, ' ')
      .replace(/\\b\\d+\\b/g, '')
      .replace(/\\s+/g, ' ')
      .trim()
      .replace(/\\b\\w/g, c => c.toUpperCase())
  }

  let musicCount = 0
  try {
    const files = (await fs.readdir(MUSIC_DIR))
      .filter(f => /\\.(mp3|webm)$/i.test(f))
      .sort()
    for (const f of files) {
      const cat = categorizeMusic(f)
      if (!cat) continue
      const slug = `${cat}-${f.replace(/\\.[^.]+$/, '')}`.slice(0, 80)
      const localPath = `audio/music/${f}`
      await prisma.backgroundMusic.upsert({
        where: { slug },
        update: { category: cat, localPath },
        create: { name: displayName(f), slug, category: cat, localPath, isUploaded: true },
      })
      musicCount++
    }
  } catch (err) {
    console.warn('Skipping music seed (no audio dir or read error):', err)
  }
  console.log(`✓ ${musicCount} background music tracks seeded`)

  console.log('\n✅ Seed complete!')
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
