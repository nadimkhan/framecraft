// Pollinations.ai Image Generation Service
// Uses the unified API: https://gen.pollinations.ai
// Docs: https://enter.pollinations.ai/api/docs

const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY // Optional for higher rate limits

export class PollinationsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PollinationsError'
  }
}

/**
 * Available image models on Pollinations
 */
export type PollinationsModel = 
  | 'flux'              // Default, fastest, 5K images/$1
  | 'flux-schnell'      // Same as flux
  | 'flux-dev'          // Higher quality flux
  | 'flux-realism'      // Photorealistic
  | 'flux-anime'        // Anime style
  | 'flux-3d'           // 3D rendered style
  | 'flux-cablyai'      // CablyAI style
  | 'flux-pony'         // Pony style
  | 'flux-ultra'        // Ultra quality
  | 'sdxl'              // Stable Diffusion XL
  | 'gptimage'          // GPT Image 1 Mini
  | 'gptimage-large'    // GPT Image 1 Large
  | 'seedream'          // Seedream 4.0
  | 'seedream-5'        // Seedream 5.0 (newer)
  | 'kontext'           // FLUX.1 Kontext
  | 'imagen'            // Imagen 4
  | 'grok-imagine'      // Grok Imagine

/**
 * Convert aspect ratio to width/height
 * Pollinations supports up to 1024x1024 on most models
 * Higher resolutions available on some models
 */
function getDimensions(aspectRatio: string): { width: number; height: number } {
  const ratios: Record<string, { width: number; height: number }> = {
    '9:16': { width: 576, height: 1024 },   // Portrait (YouTube Shorts)
    '16:9': { width: 1024, height: 576 },   // Landscape (YouTube Videos)
    '1:1': { width: 1024, height: 1024 },   // Square
    '4:3': { width: 1024, height: 768 },    // Standard
    '3:4': { width: 768, height: 1024 },    // Portrait
    '21:9': { width: 1024, height: 440 },   // Ultrawide
    '9:21': { width: 440, height: 1024 },   // Ultratall
  }
  return ratios[aspectRatio] || ratios['9:16']
}

/**
 * Generate image using Pollinations.ai unified API
 * 
 * API Endpoint: https://gen.pollinations.ai/image/{prompt}
 * 
 * Features:
 * - Free tier available (no API key)
 * - Optional API key for higher rate limits
 * - Supports custom dimensions (max 1024 on most models)
 * - Multiple models available (flux, gptimage, seedream, etc.)
 * - Seed for reproducibility
 * - No watermark
 * - Negative prompts
 * 
 * Pricing (approximate):
 * - flux: $0.0002/image (~5,000 per $1)
 * - gptimage: $0.013/image (~75 per $1)
 * - seedream: $0.03/image (~35 per $1)
 * 
 * @param prompt - The image generation prompt
 * @param aspectRatio - Aspect ratio (default: '9:16' for Shorts)
 * @param options - Optional parameters
 * @returns Base64 image data and metadata
 */
export async function generatePollinationsImage(
  prompt: string,
  aspectRatio: string = '9:16',
  options?: {
    seed?: number
    model?: PollinationsModel
    negativePrompt?: string
    enhance?: boolean
    safeMode?: boolean
  }
): Promise<{ 
  base64: string
  url: string
  width: number
  height: number
  model: string
  seed: number
}> {
  const { width, height } = getDimensions(aspectRatio)
  
  // Build the prompt with enhancements if requested
  let finalPrompt = prompt
  if (options?.enhance) {
    finalPrompt = `${prompt}, masterpiece, best quality, highly detailed, professional`
  }
  
  // Encode prompt for URL
  const encodedPrompt = encodeURIComponent(finalPrompt)
  
  // Build the API URL (unified endpoint)
  let imageUrl = `https://gen.pollinations.ai/image/${encodedPrompt}`
  
  // Build query parameters
  const params = new URLSearchParams()
  
  // Required parameters
  params.append('width', width.toString())
  params.append('height', height.toString())
  
  // Optional parameters
  const seed = options?.seed ?? Math.floor(Math.random() * 1000000)
  params.append('seed', seed.toString())
  
  // Model selection (default: flux for best value)
  const model = options?.model || 'flux'
  params.append('model', model)
  
  // No logo/watermark
  params.append('nologo', 'true')
  
  // Safe mode (optional content filtering)
  if (options?.safeMode) {
    params.append('safe', 'true')
  }
  
  // Negative prompt
  if (options?.negativePrompt) {
    params.append('negative', encodeURIComponent(options.negativePrompt))
  }
  
  // API key for higher rate limits
  if (POLLINATIONS_API_KEY) {
    params.append('key', POLLINATIONS_API_KEY)
  }
  
  imageUrl += '?' + params.toString()
  
  console.log(`[Pollinations] Generating ${width}x${height} image with model: ${model}`)
  console.log(`[Pollinations] Prompt: ${prompt.substring(0, 80)}...`)
  
  // Fetch the image
  const response = await fetch(imageUrl, {
    method: 'GET',
    headers: {
      'Accept': 'image/png,image/jpeg,image/webp,*/*',
    },
  })
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    console.error(`[Pollinations] Error ${response.status}:`, errorText)
    throw new PollinationsError(`API error ${response.status}: ${errorText}`)
  }
  
  // Verify we got an image
  const contentType = response.headers.get('content-type')
  if (!contentType?.includes('image')) {
    throw new PollinationsError(`Unexpected response type: ${contentType}`)
  }
  
  // Convert to base64
  const buffer = await response.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  
  console.log(`[Pollinations] Success! Generated ${buffer.byteLength} bytes (${model})`)
  
  return { 
    base64, 
    url: imageUrl,
    width,
    height,
    model,
    seed
  }
}

/**
 * List available image models
 * Useful for letting users choose different quality/speed tradeoffs
 */
export function getAvailableModels(): Array<{
  id: PollinationsModel
  name: string
  costPerImage: string
  imagesPerDollar: string
  description: string
  recommended?: boolean
}> {
  return [
    {
      id: 'flux',
      name: 'Flux Schnell',
      costPerImage: '~$0.0002',
      imagesPerDollar: '~5,000',
      description: 'Fast, good quality, best value for money',
      recommended: true,
    },
    {
      id: 'flux-dev',
      name: 'Flux Dev',
      costPerImage: '~$0.001',
      imagesPerDollar: '~1,000',
      description: 'Higher quality Flux variant',
    },
    {
      id: 'flux-anime',
      name: 'Flux Anime',
      costPerImage: '~$0.0002',
      imagesPerDollar: '~5,000',
      description: 'Optimized for anime/cartoon style',
    },
    {
      id: 'flux-realism',
      name: 'Flux Realism',
      costPerImage: '~$0.0002',
      imagesPerDollar: '~5,000',
      description: 'Optimized for photorealistic images',
    },
    {
      id: 'flux-ultra',
      name: 'Flux Ultra',
      costPerImage: '~$0.002',
      imagesPerDollar: '~500',
      description: 'Highest quality Flux model',
    },
    {
      id: 'gptimage',
      name: 'GPT Image 1 Mini',
      costPerImage: '~$0.013',
      imagesPerDollar: '~75',
      description: 'OpenAI\'s image model, high quality',
    },
    {
      id: 'seedream-5',
      name: 'Seedream 5.0',
      costPerImage: '~$0.02',
      imagesPerDollar: '~50',
      description: 'Latest Seedream, excellent quality',
    },
    {
      id: 'kontext',
      name: 'FLUX.1 Kontext',
      costPerImage: '~$0.03',
      imagesPerDollar: '~35',
      description: 'Premium model, requires paid balance',
    },
  ]
}

/**
 * Check if Pollinations service is available
 */
export async function isPollinationsAvailable(): Promise<boolean> {
  try {
    const response = await fetch('https://gen.pollinations.ai/health', {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Get generation info for display
 */
export function getGenerationInfo(aspectRatio: string, model: string = 'flux'): { 
  requestedRatio: string
  generatedResolution: string
  targetResolution: string
  note: string
  estimatedCost: string
} {
  const dims = getDimensions(aspectRatio)
  const cost = model === 'flux' ? '~$0.0002' : 
               model === 'gptimage' ? '~$0.013' : 
               model === 'seedream-5' ? '~$0.02' : 'varies'
  
  return {
    requestedRatio: aspectRatio,
    generatedResolution: `${dims.width}x${dims.height}`,
    targetResolution: aspectRatio === '9:16' ? '1080x1920 (YouTube Shorts)' : 
                     aspectRatio === '16:9' ? '1920x1080 (YouTube Videos)' : 
                     'Standard',
    note: 'Will be upscaled to target resolution automatically',
    estimatedCost: cost
  }
}

/**
 * Quick test function
 */
export async function testPollinations(): Promise<boolean> {
  try {
    console.log('[Pollinations] Testing API...')
    const result = await generatePollinationsImage(
      'a simple test image of a red circle',
      '1:1',
      { seed: 12345 }
    )
    console.log('[Pollinations] Test successful!')
    return true
  } catch (error) {
    console.error('[Pollinations] Test failed:', error)
    return false
  }
}
