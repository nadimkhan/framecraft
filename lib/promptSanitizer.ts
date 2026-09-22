/**
 * Build the final image prompt. Three-part structure designed for unambiguous
 * style anchoring:
 *
 *   `<style anchor>. <subject description>. <scene description>.`
 *
 * 1. **STYLE ANCHOR** (first 3-8 words) — the single defining phrase that
 *    locks in the art style. Image models weight the opening tokens heavily,
 *    so this MUST lead the prompt. Example: "Mike Mignola graphic novel
 *    illustration" for Creepy Comic.
 * 2. **SUBJECT DESCRIPTION** — names + what they look like.
 * 3. **SCENE DESCRIPTION** — composition + environment + framing + mood.
 *
 * The style anchor is extracted from the keyword block (first clause ≤ 8 words).
 * The full keyword block is also appended at the END for style reinforcement.
 */

export interface PromptBuildInput {
  promptKeywords?: string   // full keyword block from ArtStyle (e.g. "Mike Mignola graphic novel illustration, heavy black ink linework, dense cross-hatching...")
  promptQuality?: string   // quality tags (e.g. "award-winning, 8k, detailed")
  artStyleSuffix?: string  // legacy fallback if no promptKeywords
  scenePrompt: string      // the LLM-generated physical scene description
}

/**
 * Strip hallucinated style cues that the LLM might have written into the
 * scene description body (e.g. "anime style", "in the style of...").
 */
function stripStyleFragments(text: string): string {
  const fragments = [
    'in the style of',
    'style of',
    'art style',
    'anime style',
    'comic style',
    'horror style',
    'dark fantasy style',
    'photorealistic style',
    'oil painting style',
    'watercolor style',
    'pencil sketch style',
    'in a comic',
    'in an anime',
    'in horror comic',
    'in dark comic',
    'in graphic novel',
    'in the anime',
    'rendered in',
    'drawn in',
    'illustrated in',
    'style injection',
  ]

  let result = text
  for (const frag of fragments) {
    const regex = new RegExp(`\\b${frag}\\b[.,;:\\s]*`, 'gi')
    result = result.replace(regex, '')
  }

  // Remove any bracketed style labels like [Creepy Comic] or <Creepy Comic>
  result = result.replace(/[\[\<][^\]\>]*[\]\>]/g, '')
  return result.trim()
}

/**
 * Enforce one sentence per section by adding a period at the end.
 */
function enforceSentence(text: string): string {
  if (!text) return ''
  return text.endsWith('.') || text.endsWith('!') || text.endsWith('?')
    ? text
    : text + '.'
}

function enforceHierarchySentence(text: string): string {
  return enforceSentence(stripStyleFragments(text))
}

/**
 * Extract a short style anchor from the keyword block.
 *
 * "Mike Mignola graphic novel illustration, heavy black ink linework..."
 *   → "Mike Mignola graphic novel illustration"  (first clause, ≤8 words)
 */
function extractStyleAnchor(promptSuffix: string): string {
  if (!promptSuffix) return ''
  const firstClause = promptSuffix.split(',')[0]?.trim() || ''
  const words = firstClause.split(/\s+/).slice(0, 8).join(' ')
  return words
}

export interface PromptBuildResult {
  prompt: string
  cleanScene: string
}

export function buildImagePrompt(input: PromptBuildInput): PromptBuildResult {
  const { promptKeywords = '', promptQuality = '', artStyleSuffix = '', scenePrompt } = input

  const keywordsBlock = promptKeywords || artStyleSuffix

  // Strip style fragments the LLM may have written into the scene body
  let cleanScene = stripStyleFragments(scenePrompt || '')
  cleanScene = enforceHierarchySentence(cleanScene)

  if (!cleanScene) {
    const fallback = keywordsBlock || 'a central scene'
    return {
      prompt: promptQuality ? `${fallback}. ${promptQuality}` : fallback,
      cleanScene: fallback,
    }
  }

  // Structure: `<style anchor>. <clean scene>. <full keywords block>. <quality>`
  const styleAnchor = extractStyleAnchor(keywordsBlock)
  const parts: string[] = []

  if (styleAnchor) parts.push(styleAnchor)
  parts.push(cleanScene)
  if (keywordsBlock) parts.push(keywordsBlock)
  if (promptQuality) parts.push(promptQuality)

  const prompt = parts.join('. ').replace(/\.\s*\./g, '.').trim()

  return { prompt, cleanScene }
}

// ─── Video Prompt Builder ─────────────────────────────────────────────────────

export interface VideoPromptInput {
  /** The physical scene description (no style, no motion — just what the viewer sees) */
  physicalScene: string
  /** Short style anchor extracted from art style (e.g. "Mike Mignola graphic novel illustration") */
  styleAnchor: string
  /** Full style keywords from art style (e.g. "Mike Mignola graphic novel illustration, heavy black ink linework...") */
  styleKeywords: string
  /** LLM-generated motion description (may contain embedded style header — will be stripped) */
  videoMotionPrompt: string
  /** Animation type from scene (e.g. "slow-scale-rotate", "cinematic-push") */
  animationType: string
}

/**
 * Build the final video prompt with strict 3-layer separation:
 *
 *   Layer 1: `<physical scene>` — no style, no motion
 *   Layer 2: `<style anchor> <style keywords>` — visual style definition
 *   Layer 3: Camera movement + subject action + environment motion
 *
 * The videoMotionPrompt is stripped of any embedded style header (e.g.
 * "Creepy Comic — bold black ink linework camera push:...") since the style
 * block is already added as Layer 2.
 *
 * Camera terms are used ONLY in the motion layer, never mixed into the
 * physical scene description.
 */
export function buildVideoPrompt(input: VideoPromptInput): string {
  const { physicalScene, styleAnchor, styleKeywords, videoMotionPrompt, animationType } = input

  // Strip embedded style header from motion prompt (e.g. "Creepy Comic — slow zoom:...")
  const motionText = stripMotionStyleHeader(videoMotionPrompt, styleAnchor)

  // Layer 1: Physical scene
  const scene = enforceSentence(physicalScene)

  // Layer 2: Style block
  const styleBlock = styleAnchor && styleKeywords
    ? `${styleAnchor}. ${styleKeywords}`
    : styleAnchor || styleKeywords || ''

  // Layer 3: Camera + subject + environment
  const motionBlock = buildMotionBlock(motionText, animationType)

  const parts = [scene, styleBlock, motionBlock].filter(Boolean)
  return parts.join(' ').trim()
}

/**
 * Strip the style header that the LLM prepends to videoMotionPrompt.
 *
 * "Creepy Comic — bold black ink linework camera push: the camera zooms..."
 *   → "the camera zooms..."  (when styleAnchor = "Creepy Comic illustration")
 *
 * Handles: "StyleName — motion:", "StyleName — motion:", "StyleName: motion:", etc.
 */
function stripMotionStyleHeader(motionPrompt: string, styleAnchor: string): string {
  let text = motionPrompt.trim()

  if (!styleAnchor || !text) return text

  // Build patterns to strip:
  // 1. The style anchor followed by em-dash or colon + motion
  // 2. The style name only (e.g. "Creepy Comic") followed by em-dash or colon
  const styleName = styleAnchor.split(' ').slice(0, 2).join(' ') // first 2 words as shorthand

  const patterns = [
    new RegExp(`^${escapeRegex(styleAnchor)}[\\s—:–-]+`, 'i'),
    new RegExp(`^${escapeRegex(styleName)}[\\s—:–-]+`, 'i'),
  ]

  for (const pattern of patterns) {
    const before = text
    text = text.replace(pattern, '').trim()
    if (text !== before) break
  }

  return text || motionPrompt
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Structure the motion text into three explicit sections:
 *   Camera: <movement description>
 *   Subject: <action description>
 *   Environment: <ambient motion>
 *
 * If the motion text is already structured, just label the sections.
 */
function buildMotionBlock(motionText: string, animationType: string): string {
  if (!motionText) return ''

  const typeLabel = animationType
    ? animationType.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'Camera movement'

  // Check if the motion text already has section labels
  if (/\b(Camera|Subject|Environment|Focal|Action|Lighting)\b/i.test(motionText)) {
    return motionText
  }

  // Otherwise structure it: try to split on " meanwhile ", " while ", " and " to infer sections
  // Default: whole text as camera movement
  return `Camera (${typeLabel}): ${motionText}`
}
