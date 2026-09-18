/**
 * Image Service — Pollinations.ai (Flux model).
 *
 * Architecture decision (Sept 2026):
 *   - LLM text generation  → Groq + Kira + Omniroute chain (lib/llm.ts)
 *   - Voice-over / TTS     → Azure Cognitive Services (lib/tts.ts)
 *   - Image generation     → Pollinations.ai with Flux model (this file)
 *
 * Pollinations.ai free tier:
 *   - No API key required (key in .env gives higher rate limits only)
 *   - Models: flux (default), flux-dev (higher quality), flux-schnell (fastest)
 *   - Supports negative prompts to exclude unwanted elements
 *   - Supports aspect ratios: 1:1, 16:9, 9:16, 4:3, 3:2, etc.
 *   - Returns image URL; we fetch and convert to base64 for consistency
 *
 * Pollinations handles natural language scene descriptions better than MiniMax,
 * which is critical for narration-anchored prompts (style + subject identity).
 */

import { generatePollinationsImage } from './pollinations'

const POLLINATIONS_MODEL = (process.env.POLLINATIONS_MODEL as 'flux' | 'flux-dev' | 'flux-schnell') || 'flux'

export class ImageServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageServiceError'
  }
}

/**
 * Returns true — Pollinations is always available (no API key required for free tier).
 */
export function isImageServiceConfigured(): boolean {
  return true
}

/**
 * Returns "pollinations" — the fixed image service identifier for this project.
 */
export function getImageServiceType(): string {
  return 'pollinations'
}

/**
 * Generate an image via Pollinations.ai.
 *
 * Returns `{ base64, metadata }`. base64 is the JPEG-encoded image (no data: URL prefix).
 * metadata carries the model + timing info for logging.
 *
 * NOTE: Pollinations returns a URL. We fetch the image and convert to base64
 * to keep the same return shape as the previous MiniMax implementation.
 */
export async function generateImage(
  prompt: string,
  aspectRatio: string = '9:16'
): Promise<{ base64: string; metadata: Record<string, unknown> }> {
  console.log(`[ImageService] Using service: pollinations (model=${POLLINATIONS_MODEL})`)
  console.log(`[ImageService] Prompt: ${prompt.substring(0, 100)}...`)
  console.log(`[ImageService] Aspect ratio: ${aspectRatio}`)
  console.log(`[ImageService] Prompt length: ${prompt.length} chars`)

  const startTime = Date.now()

  // Pollinations.ai doesn't have a strict char limit like MiniMax (1500),
  // but very long prompts dilute attention. Trim safety: cap at 2000 chars.
  const MAX_CHARS = 2000
  let finalPrompt = prompt
  if (prompt.length > MAX_CHARS) {
    finalPrompt = prompt.slice(0, MAX_CHARS).trimEnd() + '.'
    console.warn(`[ImageService] Prompt truncated ${prompt.length} → ${finalPrompt.length} chars`)
  }

  // Negative prompt — only generic defects. Style-specific exclusions would
  // conflict with style choices (e.g. excluding "photorealistic" breaks the
  // Realism style). Style contradictions are handled in lib/promptSanitizer.ts.
  const negativePrompt = [
    'blurry',
    'low quality',
    'distorted',
    'deformed anatomy',
    'extra fingers',
    'extra limbs',
    'watermark',
    'text',
    'logo',
    'cropped',
  ].join(', ')

  const result = await generatePollinationsImage(finalPrompt, aspectRatio, {
    model: POLLINATIONS_MODEL,
    enhance: false,           // disabled: "masterpiece, best quality" tags override subject identity
    negativePrompt,
    seed: Math.floor(Math.random() * 1_000_000),
  })

  const genTime = Date.now() - startTime

  if (!result.base64) {
    throw new ImageServiceError('Pollinations returned no image data')
  }

  return {
    base64: result.base64,
    metadata: {
      service: 'pollinations',
      model: result.model,
      aspectRatio,
      generationTimeMs: genTime,
      width: result.width,
      height: result.height,
      url: result.url,
    },
  }
}
