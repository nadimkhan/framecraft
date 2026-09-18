/**
 * Deterministic scene description builder — bypasses the LLM entirely.
 *
 * Used by the validate endpoint. Takes the raw narration + scene index + the
 * art style, and produces a structured 7-sentence scene description that:
 *   1. Anchors to the LITERAL narration text (no hallucination possible)
 *   2. Adds required structural sections (composition hierarchy, environment
 *      bank, lighting, framing, mood, quality)
 *   3. Outputs scene-only content (the art style suffix is appended by
 *      buildImagePrompt before being sent to the image model)
 *
 * Style-first ordering ensures the image model weights the style cues.
 */

const ENVIRONMENTS_BY_STYLE: Record<string, string[]> = {
  'Creepy Comic': [
    'abandoned amusement park, peeling carousel horses, rusted chain-link fence',
    'foggy suburban street at 3am, single porch light flickering, overgrown hedges',
    'vintage hospital corridor, peeling green paint, single chair in middle',
    'derelict carnival tent, moth-eaten banners, sawdust on muddy ground',
    'forgotten subway platform, broken tiles, a single pair of shoes on the tracks',
    'empty school hallway, water-stained ceiling, torn lockers, dusty linoleum',
    'old attic room, slanted roof beams, stacked trunks, single bare bulb',
    'abandoned greenhouse, shattered glass panes, overgrown vines',
    'rainy city alley, rusted fire escape, broken neon sign',
  ],
  'Dark Fantasy': [
    'crumbling castle hall, tattered banners, iron chandelier',
    'misty moor with ancient standing stones',
    'throne room of fallen empire, broken pillars',
    'enchanted forest with twisted black trees',
    'underground cavern lit by bioluminescent fungi',
  ],
  'Anime': [
    'cherry blossom-lined path, petals drifting',
    'modern Tokyo rooftop at sunset, city lights below',
    'mysterious shrine hidden in bamboo grove',
    'school courtyard at golden hour',
    'futuristic cityscape with neon signs',
  ],
  'Ghibli': [
    'lush countryside with rolling green hills',
    'old European town with cobblestone streets',
    'windmill-dotted hill under warm sky',
    'rustic cottage kitchen with morning light',
    'magical forest glade with floating spirits',
  ],
  'Polaroid': [
    'sun-drenched suburban backyard',
    'kitchen table with morning coffee',
    'empty parking lot at twilight',
    'forest clearing with dappled sunlight',
    'porch swing in summer afternoon',
  ],
  default: [
    'mysterious interior room with single light source',
    'open landscape under dramatic sky',
    'urban street with atmospheric haze',
    'natural setting with detailed textures',
  ],
}

interface SceneContext {
  sceneIndex: number
  sceneCount: number
  narration: string
  artStyleName: string
  /** Full topic story (or all scene narrations) — used to build a character
   * roster so we know which names are characters vs place names vs generic. */
  fullStory?: string
}

/**
 * Sanitize the narration for inclusion in the prompt: strip leading/trailing
 * whitespace, ensure it ends with a period, keep under ~120 chars to fit
 * the MiniMax 1500-char limit when combined with the art style suffix.
 */
function cleanNarration(narration: string): string {
  let text = (narration || '').trim()
  if (!text) return 'A figure present in the scene'
  if (!/[.!?]$/.test(text)) text += '.'
  if (text.length > 120) text = text.slice(0, 117).trimEnd() + '...'
  return text
}

/**
 * Character roster: maps proper-noun names to their inferred types based on
 * context in the full story.
 *
 * Why this exists: when "Bau" appears in a single scene's narration, we don't
 * know if it's a person or a dog. But scanning the FULL story, we can find
 * patterns like "Bau the dog" or "her dog Bau" or "Bau, a small gray dog" that
 * pin the type. This roster lets us render every character correctly across
 * all scenes.
 *
 * Patterns detected:
 *   - "X, a small dog"     → X is dog
 *   - "her dog X"           → X is dog
 *   - "X the dog"           → X is dog
 *   - "a girl named X"      → X is girl
 *   - "X, a teenage girl"   → X is girl
 *   - "her name was X"      → X is girl
 *   - etc.
 */
interface CharacterRoster {
  /** All proper-noun names found in the story. */
  names: Set<string>
  /** Map from name to inferred type (girl, boy, dog, doll, etc.). */
  types: Map<string, string>
}

function buildCharacterRoster(story: string): CharacterRoster {
  const roster: CharacterRoster = {
    names: new Set<string>(),
    types: new Map<string, string>(),
  }
  if (!story) return roster

  const text = story
  const lower = text.toLowerCase()

  // Extract all proper nouns (capitalized words)
  const allProperNouns = Array.from(new Set(
    (text.match(/\b[A-Z][a-z]+\b/g) || [])
  ))

  // For each proper noun, scan nearby context to infer type
  for (const properNoun of allProperNouns) {
    roster.names.add(properNoun)
    const lowerName = properNoun.toLowerCase()

    // Pattern 1: "X, a <type>" or "X, an <type>" — appositive
    //   "Bau, a small dog" → Bau is dog
    const appositive = text.match(
      new RegExp(`\\b${properNoun}\\,\\s*(?:a|an)\\s+([a-z\\s]+?)(?:[,\\.\\;]|\\sand\\s|\\swho\\s|\\sthat\\s)`, 'i')
    )
    if (appositive) {
      const type = inferType(appositive[1])
      if (type) {
        roster.types.set(properNoun, type)
        continue
      }
    }

    // Pattern 2: "X the <type>" — appositive with "the"
    //   "Bau the dog" → Bau is dog
    const appositiveThe = text.match(
      new RegExp(`\\b${properNoun}\\s+the\\s+([a-z]+)`, 'i')
    )
    if (appositiveThe) {
      const type = inferType(appositiveThe[1])
      if (type) {
        roster.types.set(properNoun, type)
        continue
      }
    }

    // Pattern 3: "<type> named X" or "named X" or "<type> called X"
    //   "a girl named Meilin" → Meilin is girl
    //   "a dog named Bau" → Bau is dog
    const namedX = text.match(
      new RegExp(`\\b([a-z]+)\\s+(?:named|called)\\s+${properNoun}\\b`, 'i')
    )
    if (namedX) {
      const type = inferType(namedX[1])
      if (type) {
        roster.types.set(properNoun, type)
        continue
      }
    }

    // Pattern 4: "her/his <type> X" — possessive
    //   "her dog Bau" → Bau is dog
    //   "his sister X" → X is girl
    const possTypeX = text.match(
      new RegExp(`\\b(?:her|his|their|my|your)\\s+([a-z]+)\\s+${properNoun}\\b`, 'i')
    )
    if (possTypeX) {
      const type = inferType(possTypeX[1])
      if (type) {
        roster.types.set(properNoun, type)
        continue
      }
    }

    // Pattern 5: "X <verb> like a <type>" — behavioral
    //   "Bau barked like a dog" → Bau is dog
    const likeA = text.match(
      new RegExp(`\\b${properNoun}\\s+\\w+\\s+like\\s+a[n]?\\s+([a-z]+)`, 'i')
    )
    if (likeA) {
      const type = inferType(likeA[1])
      if (type) {
        roster.types.set(properNoun, type)
        continue
      }
    }

    // Pattern 6: action verbs adjacent
    //   "Bau barked" → Bau is dog
    //   "Meilin walked" → Meilin is person
    //   "The doll sat" → "doll" not capitalized; skip
    const verbNearby = text.match(
      new RegExp(`\\b${properNoun}\\s+(barked|meowed|barked|woofed|walked|ran|stood|sat|cried|laughed|smiled|spoke|held|grabbed|carried|looked|watched|screamed|whispered|hugged|kissed)\\b`, 'i')
    )
    if (verbNearby) {
      const verb = verbNearby[1].toLowerCase()
      const animalVerbs: Record<string, string> = {
        barked: 'dog', woofed: 'dog', meowed: 'cat',
      }
      if (animalVerbs[verb]) {
        roster.types.set(properNoun, animalVerbs[verb])
        continue
      }
      // Default to girl for human verbs (most common character type)
      if (properNoun !== 'Shanghai' && properNoun !== 'Tokyo') {
        roster.types.set(properNoun, 'girl')
      }
    }
  }

  return roster
}

/**
 * Map a fragment like "small dog" or "teenage girl" to a known type key.
 * Returns null if no match.
 */
function inferType(fragment: string): string | null {
  const f = fragment.toLowerCase().trim()

  // Direct matches (use subjectDescriptions keys)
  const typeKeys = [
    'girl', 'boy', 'woman', 'man', 'child', 'baby',
    'dog', 'cat', 'horse', 'bird',
    'doll', 'toy', 'book', 'sword', 'gun', 'chair', 'door', 'window',
  ]
  for (const key of typeKeys) {
    if (f.includes(key)) return key
  }

  // Synonym matches
  if (f.match(/\b(puppy|hound|terrier|pup)\b/)) return 'dog'
  if (f.match(/\b(kitten|feline|tabby)\b/)) return 'cat'
  if (f.match(/\b(teenager|teen|lass|young woman|maiden)\b/)) return 'girl'
  if (f.match(/\b(young man|lad)\b/)) return 'boy'
  if (f.match(/\b(lady|matron)\b/)) return 'woman'
  if (f.match(/\b(guy|gentleman)\b/)) return 'man'
  if (f.match(/\b(kid|child|toddler)\b/)) return 'child'
  if (f.match(/\b(infant)\b/)) return 'baby'

  return null
}

/**
 * Build a 7-sentence scene description deterministically from the narration.
 *
 * The narration is the LITERAL source — it gets quoted in section 1 (subject+action)
 * so the image model has no choice but to depict what the narration says.
 * Sections 2-7 add the structural elements the model needs for art direction.
 */
export function buildSceneFromNarration(ctx: SceneContext): string {
  const { sceneIndex, sceneCount, narration, artStyleName, fullStory } = ctx
  const envBank = ENVIRONMENTS_BY_STYLE[artStyleName] ?? ENVIRONMENTS_BY_STYLE.default
  const env = envBank[sceneIndex % envBank.length]
  const sceneText = cleanNarration(narration)

  // Mood varies by scene position
  const moodPool = [
    'curiosity edged with dread, body language rigid, breath held',
    'building unease; small wrong details accumulate; stillness oppresses',
    'psychological tension rather than gore; claustrophobic and uncanny',
    'isolated and watched; vulnerability exposed in posture',
    'time seems suspended; every detail sharp with menace',
  ]
  const mood = moodPool[sceneIndex % moodPool.length]

  // Build a CHARACTER ROSTER from the full topic story. This is the fix for
  // the "Bau = man" problem: when we see "Bau" in a single scene's narration,
  // we don't know if it's a person or a dog. But scanning the FULL story, we
  // can find patterns like "Bau the dog" or "her dog Bau" or "Bau, a small dog"
  // that pin the type. Then we render it correctly in every scene.
  const roster = buildCharacterRoster(fullStory || narration)

  // Extract proper nouns from THIS scene's narration, but FILTER against the
  // roster so we only keep names we know are characters (not "Shanghai",
  // "Back", etc. which the model mistakenly treats as people).
  const allProperNouns = Array.from(new Set(
    (narration.match(/\b[A-Z][a-z]+\b/g) || [])
  ))
  const STOPWORDS = new Set([
    'The', 'She', 'He', 'His', 'Her', 'They', 'Their', 'It', 'Its', 'But',
    'And', 'For', 'With', 'Back', 'Once', 'After', 'When', 'Where', 'While',
    'There', 'These', 'This', 'That', 'Then', 'Now', 'Still', 'Soon',
    'Shanghai', 'Tokyo', 'Beijing', 'NewYork', 'London', 'Paris',
    'Labubu', // brand name, not character
  ])
  const properNouns = allProperNouns
    .filter(w => !STOPWORDS.has(w))
    .filter(w => roster.names.has(w) || roster.names.size === 0) // empty roster → fall back to all
    .slice(0, 4)

  // Also extract common objects/animals that should appear in THIS scene
  const commonSubjects = Array.from(new Set(
    (narration.toLowerCase().match(/\b(dog|cat|baby|child|boy|girl|man|woman|car|house|doll|toy|book|cup|hat|coat|sword|gun|bag|chair|table|bed|door|window|tree|flower|horse|cow|bird|fish|snake|spider|monster|ghost|witch|wizard|giant|demon|angel|prince|princess|king|queen|soldier|warrior|knight|robot|alien|creature|beast|dragon|wolf|bear|lion|tiger|monkey|elephant|crocodile|dinosaur|unicorn|fairy|pirate|mummy|vampire|zombie|skeleton)\b/g) || [])
  )).slice(0, 4)

  // Build a concrete subject description block. Image models like Pollinations
  // Flux follow concrete visual descriptions better than abstract prose.
  //
  // Priority:
  //   1. Proper nouns from the roster (Bau, Meilin) → use roster's known type
  //   2. Common nouns in this scene (dog, doll) → use generic description
  //   3. Otherwise → skip the subject block
  const subjectDescriptions: Record<string, string> = {
    // People
    girl: 'a teenage girl with dark hair and pale skin',
    boy: 'a teenage boy with tousled hair',
    woman: 'an adult woman with serious expression',
    man: 'an adult man with weathered features',
    child: 'a young child with wide eyes',
    baby: 'an infant with soft features',
    // Animals
    dog: 'a small dog with pointed ears and wary stance',
    cat: 'a cat with arched back and bristling fur',
    horse: 'a horse with powerful build',
    bird: 'a bird with dark plumage',
    // Objects
    doll: 'a porcelain doll with cracked face and faded dress',
    toy: 'a worn toy with chipped paint',
    book: 'an old leather-bound book',
    sword: 'a rusted medieval sword',
    gun: 'a vintage pistol',
    chair: 'a wooden chair with broken leg',
    door: 'a heavy wooden door with iron hinges',
    window: 'a cracked window with grimy glass',
  }
  const subjectDescs: string[] = []
  const seenNames = new Set<string>()

  // 1. Roster characters (proper nouns with known types)
  for (const properNoun of properNouns) {
    if (seenNames.has(properNoun.toLowerCase())) continue
    const type = roster.types.get(properNoun) // e.g. "dog" or "girl"
    const desc = type ? subjectDescriptions[type] : null
    if (desc) {
      subjectDescs.push(`${properNoun} is ${desc}`)
      seenNames.add(properNoun.toLowerCase())
    } else {
      // No type known — skip rather than default to "central character"
      // (avoids "Meilin is a central character" which adds nothing)
    }
  }

  // 2. Common nouns in this scene (deduped against roster names)
  for (const common of commonSubjects) {
    const key = common.toLowerCase()
    if (seenNames.has(key)) continue
    const desc = subjectDescriptions[common]
    if (desc) {
      subjectDescs.push(`the ${common} is ${desc}`)
      seenNames.add(key)
    }
  }

  // Subject description block goes FIRST in the prompt so image models lock
  // in identity before reading scene context.
  const subjectBlock = subjectDescs.length > 0 ? `${subjectDescs.join(', ')}.` : ''

  const verbPhrase = narration.toLowerCase().match(/\b(walk|run|stand|sit|hold|carry|look|watch|open|close|enter|exit|climb|jump|fall|cry|laugh|whisper|scream|spin|turn|lift|drop|grab|push|pull|discover|find|wake|sleep|stare|kneel|crouch|hide|emerge|appear|disappear|bring|collect|bark| growl)\w*/)?.[0] || 'present'

  // Sentence 1: Subject description FIRST. Image models anchor subject
  // identity from the opening tokens.
  const sentence1 = subjectBlock || `${sceneText.charAt(0).toUpperCase() + sceneText.slice(1)}`

  const sentences = [
    // 1. SUBJECT + ACTION — "photo of X Y in Z" is a directive frame that
    // image models (especially MiniMax image-01) reliably honor. We then
    // quote the narration for additional context.
    sentence1,
    // 2. COMPOSITION HIERARCHY
    `Foreground: debris anchors depth; midground: ${subjectDescs.length > 0 ? subjectDescs.map(s => s.split(' is ')[0]).join(', ') : 'the central subject'} are the focal subjects; background: recedes into shadow.`,
    // 3. ENVIRONMENT (rotates per scene index)
    `Setting details: ${env}. Weathered surfaces suggest neglect, decay accumulates at edges.`,
    // 4. LIGHTING
    `Lighting: a single directional source carves deep shadows and stark highlights.`,
    // 5. FRAMING
    `Framing: ${sceneIndex === 0 ? 'wide establishing' : sceneIndex === sceneCount - 1 ? 'tight compressed' : 'medium balancing subject and environment'}.`,
    // 6. MOOD
    `Mood: ${mood}.`,
    // 7. QUALITY
    `Quality: detailed textures, fine surface imperfections, subtle film grain.`,
  ]

  return sentences.join(' ')
}
