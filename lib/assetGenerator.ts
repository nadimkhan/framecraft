/**
 * Asset Generator
 * Generates images (Pollinations/Kei) and voice-over (TTS) for scenes in batch.
 * Aspect ratio derives from Series.videoDuration:
 *   - short_30_40 / short_50_60 → 9:16 (portrait, YouTube Shorts)
 *   - long_60_120 / long_120_300 → 16:9 (landscape, long-form)
 */
import path from 'path'
import fs from 'fs'
import { prisma } from '@/lib/db'
import { generateImage } from './imageService'
import { generateNarrationAudio } from './tts'
import { buildImagePrompt } from './promptSanitizer'

const GENERATIONS_DIR = path.join(process.cwd(), 'public', 'generations')

function durationToAspectRatio(bucket: string | null | undefined): { ratio: string; isLong: boolean } {
  switch (bucket) {
    case 'long_60_120':
    case 'long_120_300':
      return { ratio: '16:9', isLong: true }
    case 'short_30_40':
    case 'short_50_60':
    default:
      return { ratio: '9:16', isLong: false }
  }
}

export interface AssetGenResult {
  topicId: number
  videoId: number
  scenesTotal: number
  imagesGenerated: number
  imagesFailed: number
  audiosGenerated: number
  audiosFailed: number
  aspectRatio: string
  durationBucket?: string
}

async function safeUnlink(p: string) {
  try { await fs.promises.unlink(p) } catch { /* ignore */ }
}

async function fileExists(p: string) {
  try { await fs.promises.access(p); return true } catch { return false }
}

/**
 * Generate images and voice-overs for ALL scenes of a single topic's video.
 * Skips scenes that already have an imagePath/audioPath (idempotent retry).
 */
export async function generateAssetsForTopic(topicId: number): Promise<AssetGenResult> {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: {
      video: { include: { scenes: { orderBy: { index: 'asc' } } } },
      series: {
        select: {
          videoDuration: true,
          artStyle: { select: { promptSuffix: true, promptKeywords: true, promptQuality: true } },
          voiceStyle: { select: { azureVoiceName: true, name: true } },
        },
      },
    },
  })
  if (!topic) throw new Error(`Topic ${topicId} not found`)
  if (!topic.video) throw new Error(`Topic ${topicId} has no video yet — generate scenes first`)
  if (topic.video.scenes.length === 0) throw new Error(`Topic ${topicId} video has no scenes`)

  const { ratio, isLong } = durationToAspectRatio((topic.series as any)?.videoDuration)
  const durationBucket = (topic.series as any)?.videoDuration ?? 'short_50_60'
  const artStyleSuffix = (topic.series as any)?.artStyle?.promptSuffix || ''
  const promptKeywords = (topic.series as any)?.artStyle?.promptKeywords || ''
  const promptQuality = (topic.series as any)?.artStyle?.promptQuality || ''
  // Pick voice from Series.voiceStyle, fall back to Azure default
  const azureVoice = (topic.series as any)?.voiceStyle?.azureVoiceName || 'en-US-JennyNeural'

  const scenes = topic.video.scenes
  const safeTitle = topic.video.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50) || `topic_${topicId}`
  const videoDir = path.join(GENERATIONS_DIR, safeTitle)
  await fs.promises.mkdir(videoDir, { recursive: true })

  let imagesGenerated = 0
  let imagesFailed = 0
  let audiosGenerated = 0
  let audiosFailed = 0

  // ─── Images (in parallel batches of 5) ─────────────────────────────────────
  const imageTargets = scenes.filter(s => !s.imagePath)
  if (imageTargets.length > 0) {
    const BATCH = 5
    for (let i = 0; i < imageTargets.length; i += BATCH) {
      const slice = imageTargets.slice(i, i + BATCH)
      await Promise.all(slice.map(async (scene) => {
        try {
          // Build the final image prompt via the sanitizer:
          //   1. Strip LLM-hallucinated style cues from scene.prompt
          //   2. Always prepend the canonical ArtStyle.promptSuffix
          // Result: every prompt has identical structure — style anchor first,
          // then a clean scene description with motion.
          const { prompt } = buildImagePrompt({
            artStyleSuffix,
            promptKeywords,
            promptQuality,
            scenePrompt: scene.prompt,
          })
          const result = await generateImage(prompt, ratio)
          if (result.base64) {
            const sceneDir = path.join(videoDir, `scene_${scene.index}`)
            await fs.promises.mkdir(sceneDir, { recursive: true })
            const filename = `${safeTitle}_scene_${scene.index}_${Date.now()}.png`
            const filepath = path.join(sceneDir, filename)
            await fs.promises.writeFile(filepath, Buffer.from(result.base64, 'base64'))
            const imagePath = `/generations/${safeTitle}/scene_${scene.index}/${filename}`
            await prisma.scene.update({
              where: { id: scene.id },
              data: { imagePath },
            })
            imagesGenerated++
          } else {
            imagesFailed++
          }
        } catch (e: any) {
          console.error(`[asset-gen] image failed for scene ${scene.id}:`, e.message)
          imagesFailed++
        }
      }))
    }
  }

  // ─── Audio (batches of 3 concurrent — Azure TTS allows parallelism) ──────
  const audioTargets = scenes.filter(s => !s.audioPath)
  if (audioTargets.length > 0) {
    const BATCH = 3
    for (let i = 0; i < audioTargets.length; i += BATCH) {
      const slice = audioTargets.slice(i, i + BATCH)
      await Promise.all(slice.map(async (scene) => {
        try {
          const sceneDir = path.join(videoDir, `scene_${scene.index}`)
          await fs.promises.mkdir(sceneDir, { recursive: true })
          const audioFilename = `${safeTitle}_scene_${scene.index}.mp3`
          const audioFullPath = path.join(sceneDir, audioFilename)
          const finalPath = await generateNarrationAudio(scene.narration, audioFullPath, azureVoice)
          const relPath = `/generations/${safeTitle}/scene_${scene.index}/${path.basename(finalPath)}`
          await prisma.scene.update({
            where: { id: scene.id },
            data: {
              audioPath: relPath,
              audioDurationMs: null, // could be measured later
            },
          })
          audiosGenerated++
        } catch (e: any) {
          console.error(`[asset-gen] audio failed for scene ${scene.id}:`, e.message)
          audiosFailed++
        }
      }))
    }
  }

  return {
    topicId: topic.id,
    videoId: topic.video.id,
    scenesTotal: scenes.length,
    imagesGenerated,
    imagesFailed,
    audiosGenerated,
    audiosFailed,
    aspectRatio: ratio,
    durationBucket,
  }
}

/**
 * Get scene asset stats for a single topic (used by UI to show buttons).
 */
export async function getAssetStatsForTopic(topicId: number) {
  const video = await prisma.video.findFirst({
    where: { topicId },
    include: { scenes: { select: { id: true, imagePath: true, audioPath: true } } },
  })
  if (!video) return { scenesTotal: 0, imagesReady: 0, audiosReady: 0 }
  return {
    scenesTotal: video.scenes.length,
    imagesReady: video.scenes.filter(s => !!s.imagePath).length,
    audiosReady: video.scenes.filter(s => !!s.audioPath).length,
  }
}

/**
 * Generate image for a SINGLE scene. Idempotent — if imagePath already set,
 * returns the existing path. Always appends the Series art style suffix.
 */
export async function generateImageForScene(sceneId: number): Promise<{ sceneId: number; imagePath: string; regenerated: boolean }> {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      video: {
        include: {
          topic: {
            include: {
              series: { include: { artStyle: true } },
            },
          },
        },
      },
    },
  })
  if (!scene) throw new Error(`Scene ${sceneId} not found`)
  if (!scene.video) throw new Error('Scene has no video')

  const { ratio } = durationToAspectRatio((scene.video.topic.series as any)?.videoDuration)
  const artStyleSuffix = (scene.video.topic.series as any)?.artStyle?.promptSuffix || ''
  const promptKeywords = (scene.video.topic.series as any)?.artStyle?.promptKeywords || ''
  const promptQuality = (scene.video.topic.series as any)?.artStyle?.promptQuality || ''

  // Build via sanitizer — see buildImagePrompt() in promptSanitizer.ts for rationale.
  const { prompt } = buildImagePrompt({
    artStyleSuffix,
    promptKeywords,
    promptQuality,
    scenePrompt: scene.prompt,
  })

  const result = await generateImage(prompt, ratio)
  if (!result.base64) throw new Error('Image generation returned no data')

  const safeTitle = scene.video.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50) || `video_${scene.videoId}`
  const sceneDir = path.join(GENERATIONS_DIR, safeTitle, `scene_${scene.index}`)
  await fs.promises.mkdir(sceneDir, { recursive: true })
  // Append a timestamp so successive regenerations produce unique filenames
  // (overwriting the same path would make the browser keep showing the cached
  // image even after we update the DB).
  const timestamp = Date.now()
  const filename = `${safeTitle}_scene_${scene.index}_${timestamp}.png`
  const filepath = path.join(sceneDir, filename)
  await fs.promises.writeFile(filepath, Buffer.from(result.base64, 'base64'))

  const imagePath = `/generations/${safeTitle}/scene_${scene.index}/${filename}`

  // Delete old image if regenerating
  if (scene.imagePath && scene.imagePath !== imagePath) {
    const oldPath = path.join(process.cwd(), 'public', scene.imagePath.replace(/^\//, ''))
    await fs.promises.unlink(oldPath).catch(() => {})
  }

  await prisma.scene.update({
    where: { id: sceneId },
    data: { imagePath },
  })

  return { sceneId, imagePath, regenerated: !!scene.imagePath }
}

/**
 * Generate voice-over for a SINGLE scene. Idempotent.
 * Uses the Series.voiceStyle.azureVoiceName so narration matches the
 * niche-configured voice.
 */
export async function generateAudioForScene(sceneId: number): Promise<{ sceneId: number; audioPath: string; regenerated: boolean; voice: string }> {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      video: {
        include: {
          topic: {
            include: {
              series: { include: { voiceStyle: { select: { azureVoiceName: true } } } },
            },
          },
        },
      },
    },
  })
  if (!scene) throw new Error(`Scene ${sceneId} not found`)
  if (!scene.video) throw new Error('Scene has no video')

  const azureVoice = (scene.video.topic.series as any)?.voiceStyle?.azureVoiceName || 'en-US-JennyNeural'

  const safeTitle = scene.video.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50) || `video_${scene.videoId}`
  const sceneDir = path.join(GENERATIONS_DIR, safeTitle, `scene_${scene.index}`)
  await fs.promises.mkdir(sceneDir, { recursive: true })
  const audioFilename = `${safeTitle}_scene_${scene.index}.mp3`
  const audioFullPath = path.join(sceneDir, audioFilename)
  const finalPath = await generateNarrationAudio(scene.narration, audioFullPath, azureVoice)
  const relPath = `/generations/${safeTitle}/scene_${scene.index}/${path.basename(finalPath)}`

  // Delete old audio if regenerating
  if (scene.audioPath && scene.audioPath !== relPath) {
    const oldPath = path.join(process.cwd(), 'public', scene.audioPath.replace(/^\//, ''))
    await fs.promises.unlink(oldPath).catch(() => {})
  }

  await prisma.scene.update({
    where: { id: sceneId },
    data: { audioPath: relPath, audioDurationMs: null },
  })

  return { sceneId, audioPath: relPath, regenerated: !!scene.audioPath, voice: azureVoice }
}
