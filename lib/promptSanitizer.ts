/**
 * Prompt Sanitizer
 * Ensures every image prompt sent to the model starts with the configured
 * ArtStyle.promptSuffix and has nothing else competing with it.
 *
 * Why this exists:
 * The LLM that generates scene.prompt often *hallucinated* style words like
 * "creepy horror comic style, dark ink, unsettling atmosphere" at the end
 * of the prompt — sometimes partial, sometimes wrong, sometimes duplicated.
 * Image models weight the START of the prompt heavily; mid-prompt style
 * cues get ignored, leading to inconsistent style adherence.
 *
 * Strategy:
 *   1. Strip known style cue fragments from the LLM-generated prompt body
 *   2. Strip redundant motion/composition words we already enforce in the
 *      scene-generation prompt (so we don't double-up)
 *   3. Prepend the canonical style suffix as the leading anchor
 *
 * Result: every prompt sent to the image model has identical structure:
 *   "<STYLE_SUFFIX>. <clean scene description with motion>"
 */

// Fragments of the LLM's hallucinated style cues. Lowercase, partial matches.
// We strip these from the LLM-generated scene body before prepending the
// canonical style. Covers common hallucinated phrases across niches.
const STYLE_FRAGMENTS_TO_STRIP = [
  // Style cue fragments (LLM keeps writing these)
  'creepy horror comic style',
  'creepy horror',
  // Bracketed style echoes the LLM sometimes produces, e.g. "<Creepy Comic>"
  '<creepy comic>',
  '<horror comic>',
  '<dark fantasy>',
  '<anime>',
  '<lego>',
  '<lego brick style>',
  '<photorealism>',
  '<photorealism / realism>',
  '<modern cartoon>',
  '<ghibli>',
  '<ghibli-inspired>',
  '<disney-inspired>',
  '<disney-inspired fairytale animation>',
  '<pixel art>',
  '<greek mythology>',
  '<classical painting>',
  '<polaroid / instant film>',
  '<polaroid>',
  '<instant film>',
  '<vivid, single striking visual>',
  '<single striking visual>',
  'horror comic style',
  'comic style',
  'dark ink',
  'dark comic',
  'unsettling atmosphere',
  'horror style',
  'cinematic horror',
  'cinematic dark',
  'cinematic style',
  'photorealistic cinematic',
  'cinematic lighting',
  'cinematic shot',
  'cinematic close-up',
  'cinematic angle',
  'cinematic, photorealistic, vivid',
  'photorealistic, vivid',
  'photorealistic cinematic shot',
  'cinematic composition',
  'photorealistic,',
  'cinematic,',
  'horror comic',
  'photorealistic',
  'cinematic',
  'vivid, single striking visual',
  'single striking visual',
  'single cinematic image prompt',
  'single cinematic image',
  'single cinematic',
  'single image prompt',
  'cinematic image prompt',
  'single striking',
  'image prompt',
  // Motion descriptors we already enforce in scene-gen prompt
  'with motion:',
]

function stripStyleFragments(text: string): string {
  let cleaned = text
  // Remove fragments in any order, case-insensitive
  for (const frag of STYLE_FRAGMENTS_TO_STRIP) {
    const re = new RegExp(frag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    cleaned = cleaned.replace(re, '')
  }
  // Clean up leftover punctuation/double spaces
  cleaned = cleaned
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .replace(/\s+/g, ' ')
    // Trim leading/trailing punctuation AND whitespace so we don't end up with
    // "style, , scene" or "style. . scene"
    .replace(/^[\s,.;:]+|[\s,.;:]+$/g, '')
    .trim()
  return cleaned
}

export interface PromptBuildInput {
  /** Compact 5-7 keyword anchor prepended at prompt start. Pattern from d4441a8. */
  promptKeywords?: string
  /** Quality tags appended at prompt end for fidelity enhancement. */
  promptQuality?: string
  /** Legacy: full keyword block (used as fallback when promptKeywords is missing). */
  artStyleSuffix?: string
  /** The LLM-generated or template-built scene description. */
  scenePrompt: string
}

export interface PromptBuildResult {
  /** Final prompt to send to the image model. */
  prompt: string
  /** Sanitized scene description (after stripping style fragments). */
  cleanScene: string
}

/**
 * Post-processor safety net: ensures the prompt contains a composition
 * hierarchy sentence. The LLM is supposed to write one itself (section 3 in
 * the framework), but it sometimes skips it. If missing, we synthesize a
 * generic one from the available content. We use a generic fallback so the
 * prompt at least signals "I am an art-directed shot" rather than a tag list.
 */
function enforceHierarchySentence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed

  // Check if a hierarchy sentence is already present (heuristic).
  const hasHierarchy = /^\s*(Foreground|Front|Midground|Mid|Background|Back|Composition)\s*:/i
    .test(trimmed.split(/\.\s+/)[0] || '') ||
    /Foreground:\s+.*?;\s*midground:/i.test(trimmed) ||
    /Foreground:\s+.*?,\s*midground:/i.test(trimmed)

  if (hasHierarchy) return trimmed

  // No hierarchy — insert one after the first sentence. We split on the
  // first period (after the subject/action sentence), insert a generic
  // hierarchy statement, and rejoin.
  const firstPeriod = trimmed.indexOf('. ')
  if (firstPeriod < 0) return trimmed

  const firstSentence = trimmed.slice(0, firstPeriod + 1)
  const rest = trimmed.slice(firstPeriod + 2)

  // Build a generic hierarchy based on whatever noun phrases we can detect.
  const hierarchy = 'Foreground: scene elements closest to camera anchor the depth; midground: the subject remains the focal point; background: the environment recedes softly into the frame.'

  return `${firstSentence} ${hierarchy} ${rest}`
}

/**
 * Strip a duplicated artStyleSuffix from the scene body. After a regeneration,
 * the stored prompt already ends with the suffix — calling buildImagePrompt again
 * would append a second copy. This helper detects the suffix overlap and removes it.
 *
 * Strategy: if the suffix is fully present in the scene body, trim from the
 * start of the suffix onward. If only a partial overlap exists (last 30+ chars
 * of the suffix match the end of the scene), trim from that point.
 */
function stripExistingSuffix(text: string, suffix: string): string {
  if (!suffix || !text) return text

  // Exact match: suffix is present in the text.
  const idx = text.lastIndexOf(suffix)
  if (idx >= 0) {
    return text.slice(0, idx).trimEnd().replace(/[.,;:\s]+$/, '')
  }

  // Partial match: take the last 80 chars of the suffix and check if they
  // appear at the very end of the text (catches truncation/case differences).
  const tail = suffix.slice(-80).trim()
  const tailIdx = text.toLowerCase().lastIndexOf(tail.toLowerCase())
  if (tailIdx >= 0 && tailIdx > text.length - 200) {
    return text.slice(0, tailIdx).trimEnd().replace(/[.,;:\s]+$/, '')
  }

  return text
}

/**
 * Build the final image prompt. Three-part structure designed for unambiguous
 * style anchoring:
 *
 *   `<style anchor>. <subject description>. <scene description>.`
 *
 * 1. **STYLE ANCHOR** (first 3-8 words) — the single defining phrase that
 *    locks in the art style. Image models weight the opening tokens heavily,
 *    so this MUST lead the prompt. Example: "Mike Mignola graphic novel
 *    illustration" for Creepy Comic — that's the unambiguous style declaration.
 *
 * 2. **SUBJECT DESCRIPTION** (concrete visual details) — names + what they
 *    look like. "Meilin is a teenage girl with dark hair and pale skin,
 *    Bao is a small dog with pointed ears and wary stance, a porcelain
 *    doll with cracked face and faded dress."
 *
 * 3. **SCENE DESCRIPTION** (composition + environment + lighting + framing +
 *    mood + quality) — the structured 7-section body from buildSceneFromNarration.
 *
 * The compact keyword block (promptSuffix) is split: the FIRST 3-8 words
 * become the anchor above; the FULL block is also appended at the END for
 * style reinforcement without diluting the opening anchor.
 */
export function buildImagePrompt(input: PromptBuildInput): PromptBuildResult {
  const { promptKeywords = '', promptQuality = '', artStyleSuffix = '', scenePrompt } = input

  // Backward compat: if old promptSuffix is present but no promptKeywords,
  // extract a short anchor from it. Otherwise use the dedicated promptKeywords.
  const keywordsBlock = promptKeywords || artStyleSuffix

  // Strip hallucinated style cues (e.g. "anime style" leaking into scene body).
  let cleanScene = stripStyleFragments(scenePrompt || '')

  // Also strip any duplicated keyword block from the scene body (regeneration case).
  cleanScene = stripExistingSuffix(cleanScene, keywordsBlock)
  cleanScene = enforceHierarchySentence(cleanScene)

  if (!cleanScene) {
    const fallback = keywordsBlock || 'a central scene'
    return {
      prompt: promptQuality
        ? `${fallback}. ${promptQuality}`
        : fallback,
      cleanScene: fallback,
    }
  }

  // April commit pattern: `<style keywords>, <scene description>, <quality tags>`
  // - keywords prepended at start (style anchor)
  // - quality tags appended at end (fidelity enhancement)
  // - the LLM/template-written scene description fills the middle
  const parts: string[] = []
  if (keywordsBlock) parts.push(keywordsBlock)
  parts.push(cleanScene)
  if (promptQuality) parts.push(promptQuality)

  const prompt = parts.join(', ')

  return { prompt, cleanScene }
}

/**
 * Extract a short style anchor from the keyword block.
 *
 * "Mike Mignola graphic novel illustration, heavy black ink linework..."
 *   → "Mike Mignola graphic novel illustration"  (3-8 words before first comma)
 *
 * "anime style design, cel-shaded, clean precise linework..."
 *   → "anime style design"
 *
 * "Pixar Disney 3D animated film still, appealing rounded shapes..."
 *   → "Pixar Disney 3D animated film still"
 *
 * The anchor is what goes FIRST in the prompt — it MUST be a short,
 * unambiguous style declaration that image models will recognize and lock in.
 */
function extractStyleAnchor(promptSuffix: string): string {
  if (!promptSuffix) return ''
  // First clause (up to first comma)
  const firstClause = promptSuffix.split(',')[0]?.trim() || ''
  // Cap at 8 words — longer anchors dilute attention
  const words = firstClause.split(/\s+/).slice(0, 8).join(' ')
  return words
}
