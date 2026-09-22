/**
 * Build the final image prompt. Two-part structure:
 *
 *   `<physical scene>. The style is <style description>.`
 *
 * The LLM outputs only the physical scene description (subjects, action, setting).
 * Style is injected as a single clean block at the end.
 */

export interface PromptBuildInput {
  promptKeywords?: string   // full keyword block from ArtStyle
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
    'the style is',
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
  if (text.endsWith('.') || text.endsWith('!') || text.endsWith('?')) return text
  return text + '.'
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
  cleanScene = enforceSentence(cleanScene)

  if (!cleanScene) {
    const fallback = keywordsBlock || 'a central scene'
    return {
      prompt: promptQuality ? `${fallback}. ${promptQuality}` : fallback,
      cleanScene: fallback,
    }
  }

  // Structure: `<physical scene>. The style is <style keywords>.`
  // Strip trailing periods from parts to avoid double-periods when joining
  const styleBlock = keywordsBlock
    ? `The style is ${keywordsBlock.replace(/\.+$/, '')}`
    : ''

  const parts: string[] = []
  if (cleanScene) parts.push(cleanScene.replace(/\.+$/, ''))
  if (styleBlock) parts.push(styleBlock.replace(/\.+$/, ''))
  if (promptQuality) parts.push(promptQuality.replace(/\.+$/, ''))

  // Join with space + period separator, ensure single trailing period
  const prompt = (parts.join('. ') + '.').replace(/\.\.+/g, '.').trim()

  return { prompt, cleanScene }
}

// ─── Video Prompt Builder ─────────────────────────────────────────────────────

export interface VideoPromptInput {
  /** The physical scene description (no style, no motion — just what the viewer sees) */
  physicalScene: string
  /** Full style keywords from ArtStyle (e.g. "a dark, gritty creepy comic with heavy black ink outlines...") */
  styleKeywords: string
  /** LLM-generated motion description (pure physical motion, no style) */
  videoMotionPrompt: string
  /** Animation type from scene (e.g. "slow-scale-rotate", "cinematic-push") */
  animationType: string
}

/**
 * Build the final video prompt. Three-part structure:
 *
 *   `<physical scene>. The style is <style keywords>. Camera movement: <cam>. Subject action: <subj>. Environment: <env>.`
 *
 * The LLM outputs only the physical scene + physical motion.
 * Style and motion labels are injected as separate blocks at the end.
 */
export function buildVideoPrompt(input: VideoPromptInput): string {
  const { physicalScene, styleKeywords, videoMotionPrompt, animationType } = input

  // Clean the physical scene
  const scene = enforceSentence(stripStyleFragments(physicalScene || ''))

  // Style block — strip trailing periods to avoid double-periods when joining
  const styleBlock = styleKeywords
    ? `The style is ${styleKeywords.replace(/\.+$/, '')}`
    : ''

  // Motion block — structure it into Camera / Subject / Environment sections
  const motionBlock = buildMotionBlock(videoMotionPrompt, animationType)

  const parts = [scene, styleBlock, motionBlock].filter(Boolean)
  const stripped = parts.map(p => p.replace(/\.+$/, ''))
  return (stripped.join('. ') + '.').replace(/\.\.+/g, '.').trim()
}

/**
 * Structure the motion text into Camera / Subject / Environment sections.
 * The LLM motion output is plain physical description — we label the sections.
 */
function buildMotionBlock(motionText: string, animationType: string): string {
  if (!motionText) return ''

  // If already structured, just clean and return
  if (/\b(Camera movement|Subject action|Environment)\b/i.test(motionText)) {
    return motionText.endsWith('.') ? motionText : motionText + '.'
  }

  // Split on common transition patterns to infer sections
  const sentences = motionText.split(/(?<=[.!?])\s+/).filter(Boolean)

  let camera = ''
  let subject = ''
  let environment = ''

  const camIndicators = ['camera', 'zoom', 'pan', 'dolly', 'tilt', 'track', 'push', 'pull', 'slow']
  const subjIndicators = ['her eyes', 'his eyes', 'their eyes', 'head turns', 'turns her', 'turns his', 'turns their', 'steps', 'backs', 'raises', 'drops', 'reaches', 'widen', 'sweat', 'trembles', 'shakes', 'mouth opens', 'voice']
  const envIndicators = ['background', 'shelf', 'shelves', 'window', 'wind', 'dust', 'light', 'shadow', 'fog', 'room', 'wall', 'floor', 'ceiling', 'corner', 'door', 'tin soldiers', 'dolls']

  for (const sent of sentences) {
    const lower = sent.toLowerCase()
    if (!camera && camIndicators.some(w => lower.includes(w))) {
      camera = sent.trim()
    } else if (!subject && subjIndicators.some(w => lower.includes(w))) {
      subject = sent.trim()
    } else if (!environment && envIndicators.some(w => lower.includes(w))) {
      environment = sent.trim()
    } else if (!subject) {
      // Fallback: first unmatched sentence becomes subject
      subject = sent.trim()
    } else {
      environment = sent.trim()
    }
  }

  // Fallbacks
  if (!camera) camera = sentences[0]?.trim() || ''
  if (!subject && sentences.length > 1) subject = sentences[1]?.trim() || ''
  if (!environment && sentences.length > 2) environment = sentences[2]?.trim() || ''

  const typeLabel = animationType
    ? animationType.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'Camera movement'

  const sections: string[] = []
  if (camera) sections.push(`Camera (${typeLabel}): ${camera}`)
  if (subject) sections.push(`Subject action: ${subject}`)
  if (environment) sections.push(`Environment: ${environment}`)

  return sections.join('. ') + '.'
}

