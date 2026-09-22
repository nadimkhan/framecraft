/**
 * Scene Generator
 * Splits a story (fullStory or sourceTranscript) into Scene records using Kira LLM.
 *
 * Niche/Series-aware:
 *  - Looks up Topic -> Series -> derives scene count from `Series.videoDuration`:
 *      short_30_40  -> 4 scenes (~8-10s narration each)
 *      short_50_60  -> 5 scenes (~10-12s each)
 *      long_60_120  -> 8 scenes
 *      long_120_300 -> 12 scenes
 *  - If Series has `SceneStyle[]` entries, uses them as prompt hints per scene type
 *  - Applies `Series.artStyle.promptSuffix` to all image prompts
 */
import { prisma } from '@/lib/db'
import { buildImagePrompt } from './promptSanitizer'
import { buildSceneSystemPrompt, matchStyleSpec } from './promptStyles'
import { generateText } from './llm'

const VALID_ANIMATION_TYPES = [
  'none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right',
  'pan-up', 'pan-down', 'slow-scale-rotate', 'parallax-layer',
  'subtle-float', 'cinematic-push', 'ken-burns', 'spiral-zoom',
  'pulse-breathe', 'drift-diagonal', 'focus-pull', 'orbit-light',
] as const

type AnimationType = typeof VALID_ANIMATION_TYPES[number]

interface ScenePlan {
  narration: string
  prompt: string
  animationType: AnimationType
  videoMotionPrompt: string
}

interface GeneratedScript {
  title?: string
  scenes: ScenePlan[]
}

export interface SceneGenResult {
  videoId: number
  topicId: number
  sceneCount: number
  sceneTarget: number
  alreadyExisted: boolean
  title?: string
  durationBucket?: string
  nicheCategory?: string
  artStyleApplied?: string
}

function extractJson(text: string): any | null {
  if (!text) return null
  let cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    const p = JSON.parse(cleaned)
    if (p && typeof p === 'object') return p
  } catch { /* fall through */ }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch { /* fall through */ }
  }
  return null
}

function isValidAnimationType(v: string): v is AnimationType {
  return VALID_ANIMATION_TYPES.includes(v as AnimationType)
}

async function callLLM(prompt: string, systemPrompt: string): Promise<string | null> {
  const result = await generateText(systemPrompt, prompt, { temperature: 0.8, maxTokens: 6000, responseFormatJson: true })
  return result?.content || null
}

/**
 * Map a videoDuration bucket to (min/max scenes, target secs per scene).
 * Scene count is a RANGE — the LLM picks the right number based on story pacing.
 * Per-scene narration length scales with format:
 *   - Shorts: 4-8 seconds (fast pacing, hook every beat)
 *   - Long-form: 15-25 seconds (room for setup, dialogue, payoff)
 */
function durationBucketToScenes(bucket: string | null | undefined): {
  minCount: number; maxCount: number; minSecs: number; maxSecs: number; label: string; isLong: boolean
} {
  switch (bucket) {
    case 'short_30_40':
      return { minCount: 5, maxCount: 7, minSecs: 4, maxSecs: 8, label: 'short (30-40s)', isLong: false }
    case 'short_50_60':
      return { minCount: 7, maxCount: 10, minSecs: 4, maxSecs: 8, label: 'short (50-60s)', isLong: false }
    case 'long_60_120':
      return { minCount: 8, maxCount: 14, minSecs: 15, maxSecs: 25, label: 'long (1-2min)', isLong: true }
    case 'long_120_300':
      return { minCount: 14, maxCount: 24, minSecs: 15, maxSecs: 25, label: 'long (2-5min)', isLong: true }
    default:
      return { minCount: 6, maxCount: 9, minSecs: 4, maxSecs: 8, label: 'default short', isLong: false }
  }
}

export async function generateScenesForTopic(
  topicId: number,
  options: { force?: boolean } = {}
): Promise<SceneGenResult> {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: {
      video: { include: { scenes: true } },
      series: {
        include: {
          niche: true,
          artStyle: true,
          sceneStyles: true,
        },
      },
    },
  })
  if (!topic) throw new Error(`Topic ${topicId} not found`)

  // ─── Derive scene plan from Series settings ──────────────────────────────
  const series = topic.series
  const durationBucket = (series as any)?.videoDuration ?? 'short_50_60'
  const scenePlan = durationBucketToScenes(durationBucket)
  const { minCount, maxCount, minSecs, maxSecs, label: durationLabel, isLong } = scenePlan
  const sceneTarget = maxCount // upper bound for status reporting
  const nicheCategory = series?.niche?.category
  const artStyleSuffix = series?.artStyle?.promptSuffix || ''
  const artStyleName = series?.artStyle?.name
  const artStyleKeywords = series?.artStyle?.promptKeywords || ''
  const sceneStyles: any[] = (series as any)?.sceneStyles || []

  // ─── Ensure Video exists ────────────────────────────────────────────────
  let video: any = topic.video
  if (!video) {
    video = await prisma.video.create({
      data: {
        topicId: topic.id,
        title: topic.title,
        durationSeconds: isLong ? 180 : 50,
      },
    })
    video.scenes = [] // Fresh video has no scenes
  }

  // ─── Idempotent: return existing scenes UNLESS force=true ──────────────
  if (!options.force && video.scenes && video.scenes.length > 0) {
    return {
      videoId: video.id,
      topicId: topic.id,
      sceneCount: video.scenes.length,
      sceneTarget,
      alreadyExisted: true,
      durationBucket,
      nicheCategory,
      artStyleApplied: artStyleName,
    }
  }

  // ─── Force-regenerate: delete existing scenes first ──────────────────────
  if (options.force && video.scenes && video.scenes.length > 0) {
    console.log(`[scene-gen] Force-regenerating topic ${topic.id}: deleting ${video.scenes.length} existing scenes`)
    await prisma.scene.deleteMany({ where: { videoId: video.id } })
  }

  // ─── Get the story text ──────────────────────────────────────────────────
  const story = topic.fullStory || topic.sourceTranscript || ''
  if (!story.trim()) {
    throw new Error(`Topic ${topic.id} has no story/transcript to split`)
  }

  // ─── Build context-aware LLM prompt ──────────────────────────────────────
  const sceneStyleGuidance = sceneStyles.length > 0
    ? `\n\nScene type guidance — use these visual cues for each scene's index:\n` +
      sceneStyles.map((ss: any) => `Scene ${ss.sceneType}: ${ss.prompt}`).join('\n')
    : ''

  const nicheContext = nicheCategory
    ? `\n\nThis is a ${nicheCategory} video — match the visual tone accordingly.`
    : ''

  // Build the image-prompt design system block for the configured style.
  const styleSpec = matchStyleSpec(artStyleName)
  const styleDesignBlock = `\n\n# IMAGE PROMPT DESIGN — Every scene's "prompt" field must follow this design system:\n${buildSceneSystemPrompt(styleSpec, nicheCategory || 'general')}\n`

  // Build the JSON example string safely (no backticks inside template)
  const jsonExample = JSON.stringify({
    title: "improved video title",
    scenes: [
      {
        narration: "exact narration text for this scene, 8-15 words",
        prompt: "image prompt that depicts EXACTLY what this narration describes",
        animationType: "zoom-in",
        videoMotionPrompt: "2-3 sentences describing camera motion and focal point changes.",
      },
    ],
  })

  const systemPrompt = `You are a YouTube video script director for a ${durationLabel} video.
You will split the user's story into scenes. CRITICAL PACING RULES:
- Use between ${minCount} and ${maxCount} scenes total — pick the count that fits the story's natural rhythm. Do NOT force a fixed number.
- Each scene's narration must read in ${minSecs}-${maxSecs} seconds when spoken aloud. That's ${isLong ? 'about 30-60 words' : 'strictly under 20 words, ideally 8-15'} per scene.
- If a slice of the story is too long for one scene, SPLIT IT across multiple scenes — never cram too many words into one narration field.
- Different scenes can have different lengths — match each slice to the story's pacing.
${styleDesignBlock}${nicheContext}${sceneStyleGuidance}

# CHARACTER NAME PRESERVATION (critical)
# Preserve character names EXACTLY as they appear in the original story.
# The LLM often invents slight name variants (Bio -> Beau, Milan -> Malin) which
# causes the downstream image generator to lose track of which entity is which
# character. Use the EXACT spelling from the story's first mention.
- When a character first appears in the story, note the EXACT spelling of their
  name. Use this spelling in every subsequent narration that mentions them.
- Do NOT rename characters, swap first/last names, or create variants.

# SUBJECT ANCHORING RULE (critical)
The "prompt" for each scene MUST be visually grounded in THAT scene's "narration". Specifically:
- The SUBJECT, ACTION, and KEY OBJECTS in the prompt must come directly from the narration text of that scene — not invented, not borrowed from elsewhere in the story.
- If narration says "a girl holds a cracked doll", the prompt must depict a girl holding a cracked doll — not "a woman with a mirror", not "a girl among dolls in a flooded room".
- If the narration names a specific location (e.g. "abandoned school hallway"), the prompt must place the scene in that location.
- If the narration names a specific action (e.g. "she lifts the doll toward the camera"), the prompt must depict that exact action.
- Never invent subjects, settings, or props that don't appear in the narration. If the narration is vague, fill from the IMMEDIATE context of that scene's slice of the story.
- Don't carry over details from other scenes. Each scene's prompt is self-contained and tied to its own narration.

# VIDEO ANIMATION (per scene — critical)
For EACH scene, you must provide:
1. "animationType": pick ONE from this exact list — no other values allowed:
   none, zoom-in, zoom-out, pan-left, pan-right, pan-up, pan-down,
   slow-scale-rotate, parallax-layer, subtle-float, cinematic-push,
   ken-burns, spiral-zoom, pulse-breathe, drift-diagonal, focus-pull, orbit-light
   Pick based on the scene's emotional tone, pacing, and camera intent.

2. "videoMotionPrompt": 2-3 sentences describing HOW the image animates, with art style woven into the description.
   Art style context: "${artStyleKeywords || artStyleSuffix || artStyleName || 'the configured art style'}"
   — weave the style keywords naturally into the motion description throughout all scenes.
   Describe: camera movement, focal point shifts, what moves vs stays still,
   and how motion creates emotional impact in this art style. Match the animationType selected.
   Example (Creepy Comic): "Creepy horror comic camera push: the camera zooms toward Milan's face as the toy shop shelves blur into halftone shadow. A dramatic ink-black shadow crawls across her skin while the cracked doll stays perfectly still. The zoom, rendered in bold black linework, amplifies her isolation in classic gothic panel style."

Return ONLY valid JSON (no markdown, no preamble):
${jsonExample}
- Each narration MUST be a CONTIGUOUS slice of the original story in order (no skipping, no reordering).
- Every word of the original story must appear in exactly one scene's narration.
- Each image prompt must follow the IMAGE PROMPT DESIGN framework above AND the SUBJECT ANCHORING RULE — depict exactly what the narration describes.
- animationType MUST be one of the 17 exact values listed above — do not invent new ones.
- videoMotionPrompt should describe actual motion, not just repeat the narration.`

  const userPrompt = `Title: ${topic.title}

Story to split into ${minCount}-${maxCount} scenes (each scene narration reads in ${minSecs}-${maxSecs} seconds):
${story.slice(0, 6000)}

Return JSON with scenes — pick the count that best fits the story's natural pacing:`

  const content = await callLLM(userPrompt, systemPrompt)
  if (!content) {
    throw new Error('LLM providers returned no content for scene generation')
  }

  const parsed = extractJson(content) as GeneratedScript | null
  console.log('[scene-gen] LLM raw response:', content?.slice(0, 500))
  if (!parsed || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error('Failed to parse scene JSON from LLM response')
  }

  // ─── Clamp scene count to expected range ─────────────────────────────────
  const inputScenes = parsed.scenes.filter((s: any) =>
    typeof s?.narration === 'string' && typeof s?.prompt === 'string'
  )
  if (inputScenes.length === 0) {
    throw new Error('LLM returned scenes but all were missing narration/prompt fields')
  }
  let clampedScenes = inputScenes
  if (inputScenes.length > maxCount) {
    console.log(`[scene-gen] LLM returned ${inputScenes.length} scenes, clamping to maxCount=${maxCount}`)
    clampedScenes = inputScenes.slice(0, maxCount)
  } else if (inputScenes.length < minCount) {
    console.log(`[scene-gen] LLM returned ${inputScenes.length} scenes (below min ${minCount}), accepting`)
  }

  // ─── Post-process: clamp oversize narrations ─────────────────────────────
  function splitLongNarration(text: string, maxWords: number): string[] {
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length <= maxWords) return [text.trim()]
    const chunks: string[] = []
    let buf: string[] = []
    for (const w of words) {
      buf.push(w)
      if (buf.length >= maxWords) {
        chunks.push(buf.join(' '))
        buf = []
      }
    }
    if (buf.length > 0) chunks.push(buf.join(' '))
    return chunks
  }

  const maxWordsPerScene = isLong ? 60 : 20
  const expandedScenes: ScenePlan[] = []
  for (const s of clampedScenes) {
    const chunks = splitLongNarration(s.narration, maxWordsPerScene)
    for (const chunk of chunks) {
      expandedScenes.push({
        narration: chunk,
        prompt: s.prompt || '',
        animationType: isValidAnimationType(s.animationType) ? s.animationType : 'none',
        videoMotionPrompt: s.videoMotionPrompt || '',
      })
    }
  }
  const trimmedScenes = expandedScenes.length > maxCount ? expandedScenes.slice(0, maxCount) : expandedScenes
  if (expandedScenes.length > maxCount) {
    console.log(`[scene-gen] post-split produced ${expandedScenes.length}, trimmed to ${maxCount}`)
  }

  // ─── Apply art style via the sanitizer ───────────────────────────────────
  const scenesToCreate = trimmedScenes.map((s, i) => {
    const { prompt } = buildImagePrompt({
      artStyleSuffix,
      scenePrompt: s.prompt || '',
    })
    return {
      videoId: video.id,
      index: i,
      narration: s.narration,
      prompt,
      animationType: s.animationType,
      videoMotionPrompt: s.videoMotionPrompt,
    }
  })

  if (scenesToCreate.length === 0) {
    throw new Error('LLM returned scenes but all were missing narration/prompt fields')
  }

  // ─── Persist scenes ──────────────────────────────────────────────────────
  const created = []
  for (const sceneData of scenesToCreate) {
    const scene = await prisma.scene.create({ data: sceneData })
    created.push(scene)
  }

  // ─── Update Video with full narration + title ────────────────────────────
  const fullNarration = created.map(s => s.narration).join(' ')
  await prisma.video.update({
    where: { id: video.id },
    data: {
      narration: fullNarration,
      title: parsed.title || video.title,
    },
  })

  return {
    videoId: video.id,
    topicId: topic.id,
    sceneCount: created.length,
    sceneTarget,
    alreadyExisted: false,
    title: parsed.title,
    durationBucket,
    nicheCategory,
    artStyleApplied: artStyleName,
  }
}
