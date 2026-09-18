// Image Upscaling Service
// Uses sharp for high-quality resizing and enhancement

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

export class UpscalingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpscalingError'
  }
}

// Target resolutions for YouTube
const TARGET_RESOLUTIONS: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },   // YouTube Shorts (Full HD)
  '16:9': { width: 1920, height: 1080 },   // YouTube Videos (Full HD)
  '1:1': { width: 1080, height: 1080 },    // Square
}

/**
 * Upscale image to target resolution for YouTube
 * Uses sharp for high-quality Lanczos3 resampling
 */
export async function upscaleImage(
  inputPath: string,
  aspectRatio: string = '9:16',
  options?: {
    sharpen?: boolean
    denoise?: boolean
    enhance?: boolean
  }
): Promise<{ outputPath: string; originalSize: string; upscaledSize: string }> {
  const target = TARGET_RESOLUTIONS[aspectRatio]
  if (!target) {
    throw new UpscalingError(`Unknown aspect ratio: ${aspectRatio}`)
  }

  // Check input file exists
  if (!fs.existsSync(inputPath)) {
    throw new UpscalingError(`Input file not found: ${inputPath}`)
  }

  // Get original dimensions
  const metadata = await sharp(inputPath).metadata()
  const originalWidth = metadata.width || 0
  const originalHeight = metadata.height || 0

  console.log(`[Upscale] Original: ${originalWidth}x${originalHeight} → Target: ${target.width}x${target.height}`)

  // Build sharp pipeline
  let pipeline = sharp(inputPath, {
    failOnError: false
  })

  // Resize with high-quality Lanczos3 kernel
  pipeline = pipeline.resize({
    width: target.width,
    height: target.height,
    fit: 'fill', // Exact dimensions, may stretch slightly
    kernel: sharp.kernel.lanczos3
  })

  // Optional: Apply sharpening for AI-generated images
  if (options?.sharpen !== false) {
    pipeline = pipeline.sharpen({
      sigma: 1.2,
      m1: 0.5,
      m2: 0.8
    })
  }

  // Optional: Slight contrast enhancement
  if (options?.enhance) {
    pipeline = pipeline.modulate({
      brightness: 1.05,
      saturation: 1.1
    })
  }

  // Output path - add _upscaled suffix
  const parsed = path.parse(inputPath)
  const outputPath = path.join(parsed.dir, `${parsed.name}_upscaled${parsed.ext}`)

  // Save with high quality
  await pipeline
    .png({ 
      quality: 95,
      compressionLevel: 6
    })
    .toFile(outputPath)

  // Get file sizes for logging
  const originalStats = fs.statSync(inputPath)
  const upscaledStats = fs.statSync(outputPath)

  const originalSize = formatBytes(originalStats.size)
  const upscaledSize = formatBytes(upscaledStats.size)

  console.log(`[Upscale] Complete: ${originalSize} → ${upscaledSize}`)
  console.log(`[Upscale] Saved to: ${outputPath}`)

  return { 
    outputPath, 
    originalSize,
    upscaledSize 
  }
}

/**
 * Quick upscale for base64 images (used in Pollinations flow)
 */
export async function upscaleBase64Image(
  base64Data: string,
  aspectRatio: string = '9:16'
): Promise<{ base64: string; width: number; height: number }> {
  const target = TARGET_RESOLUTIONS[aspectRatio]
  if (!target) {
    throw new UpscalingError(`Unknown aspect ratio: ${aspectRatio}`)
  }

  const buffer = Buffer.from(base64Data, 'base64')

  console.log(`[Upscale] Processing base64 image → ${target.width}x${target.height}`)

  const processedBuffer = await sharp(buffer, { failOnError: false })
    .resize({
      width: target.width,
      height: target.height,
      fit: 'fill',
      kernel: sharp.kernel.lanczos3
    })
    .sharpen({
      sigma: 1.0,
      m1: 0.5,
      m2: 0.8
    })
    .modulate({
      brightness: 1.05,
      saturation: 1.05
    })
    .png({ quality: 95 })
    .toBuffer()

  return {
    base64: processedBuffer.toString('base64'),
    width: target.width,
    height: target.height
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Check if image needs upscaling
 */
export function needsUpscaling(
  currentWidth: number,
  currentHeight: number,
  aspectRatio: string
): boolean {
  const target = TARGET_RESOLUTIONS[aspectRatio]
  if (!target) return false
  
  return currentWidth < target.width || currentHeight < target.height
}

/**
 * Get target resolution info
 */
export function getTargetResolution(aspectRatio: string): { 
  width: number
  height: number
  description: string 
} {
  const target = TARGET_RESOLUTIONS[aspectRatio] || TARGET_RESOLUTIONS['9:16']
  return {
    ...target,
    description: aspectRatio === '9:16' 
      ? 'YouTube Shorts (Full HD Portrait)'
      : aspectRatio === '16:9'
      ? 'YouTube Video (Full HD Landscape)'
      : 'Square Format'
  }
}
