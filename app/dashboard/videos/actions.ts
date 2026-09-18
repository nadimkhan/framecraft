'use server'

import prisma from '@/lib/db'
import { generateScriptWithOpenRouter, generateScriptWithCustomModel, generateVideoDescription } from '@/lib/ai'
import { generateImage, isImageServiceConfigured } from '@/lib/imageService'
import { generateNarrationAudio, sanitizeFolderName } from '@/lib/tts'
import path from 'path'
import fs from 'fs'
import sharp from 'sharp'

const GENERATIONS_DIR = path.join(process.cwd(), 'public', 'generations')
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const POLL_INTERVAL = 5000 // 5 seconds

function getAllMetadataModels(): string[] {
  const models: string[] = []
  for (let i = 1; i <= 10; i++) {
    const model = process.env[`SCRIPT_MODEL_${i}`]
    if (model) {
      models.push(model)
    }
  }
  if (models.length === 0) {
    models.push('nousresearch/hermes-4-405b')
  }
  return models
}

// Adaptive timeout: Allow 3x video duration + 10 min buffer
// For a 30-min video: 30*3*60 + 600 = 6000s = 100 minutes
function getMaxPollAttempts(estimatedDurationSeconds: number): number {
  const estimatedRenderSeconds = estimatedDurationSeconds * 3 + 600;
  return Math.max(Math.ceil(estimatedRenderSeconds / (POLL_INTERVAL / 1000)), 120);
}

interface JobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}

async function pollForCompletion(jobId: string, estimatedDurationSeconds: number = 60): Promise<JobStatus> {
  const maxAttempts = getMaxPollAttempts(estimatedDurationSeconds);
  console.log(`Polling for completion (max ${maxAttempts} attempts, ~${(maxAttempts * POLL_INTERVAL / 60000).toFixed(1)} minutes)`);
  
  let attempts = 0
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
    
    const response = await fetch(`${APP_URL}/api/render-video?jobId=${jobId}`)
    if (!response.ok) {
      attempts++
      continue
    }
    
    const job: JobStatus = await response.json()
    console.log(`[Poll] Job ${jobId}: ${job.status}`)
    
    if (job.status === 'completed') {
      return job
    }
    
    if (job.status === 'failed') {
      throw new Error(job.error || 'Render failed')
    }
    
    attempts++
  }
  
  const maxMinutes = Math.round(maxAttempts * POLL_INTERVAL / 60000);
  throw new Error(`Render timeout after ${maxMinutes} minutes - the render is still in progress. Please refresh to check status.`)
}

export interface GeneratedScript {
  title: string
  narration: string
  durationSeconds: number
  scenes: Array<{
    index: number
    narration: string
    prompt: string
  }>
}

export async function getSelectedTopics() {
  const topics = await prisma.topic.findMany({
    where: {
      isExistingVideo: false,
      OR: [
        { video: null },
        { video: { narration: '' } },
      ],
    },
    include: {
      batch: true,
    },
    orderBy: {
      id: 'asc',
    },
  })
  return topics
}

export async function getAllVideos() {
  const videos = await prisma.video.findMany({
    where: {
      narration: {
        not: '',
      },
    },
    include: {
      topic: true,
      scenes: {
        orderBy: {
          index: 'asc',
        },
      },
    },
    orderBy: {
      id: 'desc',
    },
  })
  return videos
}

export async function getVideoById(videoId: number) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      topic: true,
      scenes: {
        orderBy: {
          index: 'asc',
        },
      },
    },
  })
  return video
}

export async function generateScriptAndScenes(topicId: number, model?: string) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
  })

  if (!topic) {
    throw new Error('Topic not found')
  }

  const existingVideo = await prisma.video.findUnique({
    where: { topicId },
  })

  const scriptData = model 
    ? await generateScriptWithCustomModel(topic.title, model)
    : await generateScriptWithOpenRouter(topic.title)

  const cleanNarration = (text: string) => text.replace(/\*+/g, '"')

  const formattedNarration = cleanNarration(scriptData.narration)
  const modelUsed = model || process.env.SCRIPT_MODEL_1 || 'stepfun/step-3.5-flash:free'

  let video
  if (existingVideo) {
    if (existingVideo.narration && existingVideo.narration.trim().length > 0) {
      throw new Error('Script already generated for this topic')
    }
    
    video = await prisma.video.update({
      where: { id: existingVideo.id },
      data: {
        title: scriptData.title,
        narration: formattedNarration,
        durationSeconds: scriptData.durationSeconds || 45,
        generationStatus: 'generating',
        model: modelUsed,
        scenes: {
          deleteMany: {},
          create: scriptData.scenes.map((scene) => ({
            index: scene.index,
            narration: cleanNarration(scene.narration),
            prompt: scene.prompt,
          })),
        },
      },
      include: {
        topic: true,
        scenes: {
          orderBy: {
            index: 'asc',
          },
        },
      },
    })
  } else {
    video = await prisma.video.create({
      data: {
        topicId: topic.id,
        title: scriptData.title,
        narration: formattedNarration,
        durationSeconds: scriptData.durationSeconds || 45,
        generationStatus: 'generating',
        model: modelUsed,
        scenes: {
          create: scriptData.scenes.map((scene) => ({
            index: scene.index,
            narration: cleanNarration(scene.narration),
            prompt: scene.prompt,
          })),
        },
      },
      include: {
        topic: true,
        scenes: {
          orderBy: {
            index: 'asc',
          },
        },
      },
    })
  }

  return video
}

export async function generateAllSelectedScripts() {
  const selectedTopics = await prisma.topic.findMany({
    where: {
      selected: true,
      video: null,
    },
  })

  const results = {
    success: [] as number[],
    failed: [] as { topicId: number; error: string }[],
  }

  for (const topic of selectedTopics) {
    try {
      const video = await generateScriptAndScenes(topic.id)
      results.success.push(video.id)
    } catch (error) {
      results.failed.push({
        topicId: topic.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return results
}

export async function deleteFullVideo(videoId: number) {
  const video = await prisma.video.findUnique({
    where: { id: videoId }
  })

  if (!video) {
    throw new Error('Video not found')
  }

  if (video.videoPath) {
    const fullPath = path.join(process.cwd(), 'public', video.videoPath.replace(/^\//, ''))
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }
  }

  await prisma.video.update({
    where: { id: videoId },
    data: { videoPath: null, generationStatus: 'generating' }
  })
}

export async function deleteWindowsVideo(videoId: number) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { topic: true }
  })

  if (!video) {
    throw new Error('Video not found')
  }

  const sanitizedTitle = sanitizeFolderName(video.topic.title)
  const windowsVideoPath = path.join(process.cwd(), 'public', 'generations', sanitizedTitle, `${sanitizedTitle}.mp4`)
  
  if (fs.existsSync(windowsVideoPath)) {
    fs.unlinkSync(windowsVideoPath)
    return { success: true, message: 'Windows video deleted' }
  }
  
  return { success: false, message: 'Windows video file not found' }
}

export async function deleteVideo(videoId: number) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { topic: true }
  })

  if (video) {
    const sanitizedTitle = video.topic.title.replace(/[^a-zA-Z0-9]/g, '_')
    const videoDir = path.join(GENERATIONS_DIR, sanitizedTitle)
    if (fs.existsSync(videoDir)) {
      fs.rmSync(videoDir, { recursive: true, force: true })
    }
  }

  await prisma.scene.deleteMany({
    where: { videoId },
  })
  
  await prisma.video.delete({
    where: { id: videoId },
  })
}

export async function deleteTopic(topicId: number) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: { video: true }
  })

  if (!topic) {
    throw new Error('Topic not found')
  }

  if (topic.video) {
    await prisma.scene.deleteMany({
      where: { videoId: topic.video.id },
    })
    await prisma.video.delete({
      where: { id: topic.video.id },
    })
  }

  await prisma.topic.delete({
    where: { id: topicId },
  })
}

export async function generateSingleSceneImage(sceneId: number) {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      video: {
        include: { topic: true }
      }
    }
  })

  if (!scene) {
    throw new Error('Scene not found')
  }

  if (scene.imagePath) {
    throw new Error('Image already generated for this scene')
  }

  if (scene.taskId) {
    throw new Error('Image generation already in progress for this scene')
  }

  const sanitizedTitle = sanitizeFolderName(scene.video.topic.title)
  const sceneDir = path.join(GENERATIONS_DIR, sanitizedTitle, `scene_${scene.index}`)
  
  if (!fs.existsSync(sceneDir)) {
    fs.mkdirSync(sceneDir, { recursive: true })
  }

  let promptToUse = scene.prompt

  // Check if image service is configured
  if (!isImageServiceConfigured()) {
    throw new Error('Image generation service not configured. Please set IMAGE_SERVICE_TYPE in your .env file.')
  }

  console.log(`\n[Scene ${sceneId}] 🎬 Processing scene ${scene.index}`)

  // Determine aspect ratio based on video duration
  // Shorts (< 60 seconds) = 9:16, Long Form (>= 60 seconds) = 16:9
  const videoDuration = scene.video.durationSeconds || 0
  const aspectRatio = videoDuration < 60 ? '9:16' : '16:9'
  console.log(`[Scene ${sceneId}] Video duration: ${videoDuration}s → Aspect ratio: ${aspectRatio}`)

  try {
    // Generate image using Pollinations (synchronous)
    console.log(`[Scene ${sceneId}] Starting image generation...`)
    const result = await generateImage(promptToUse, aspectRatio)

    if (!result.base64) {
      throw new Error('Image service returned no image data')
    }

    // Save image file with consistent naming: {topic_title}_scene_{index}.png
    const imageFileName = `${sanitizedTitle}_scene_${scene.index}.png`
    const imagePath = path.join(sceneDir, imageFileName)
    const relativePath = `/generations/${sanitizedTitle}/scene_${scene.index}/${imageFileName}`

    // Write base64 to file
    fs.writeFileSync(imagePath, Buffer.from(result.base64, 'base64'))

    // Update scene with image path
    await prisma.scene.update({
      where: { id: sceneId },
      data: {
        imagePath: relativePath,
        taskId: null
      }
    })

    // Log success with metadata
    console.log(`[Scene ${sceneId}] ✅ Image saved: ${relativePath}`)
    if (result.metadata) {
      const meta = result.metadata as Record<string, unknown>
      console.log(`[Scene ${sceneId}] 📊 Stats:`, {
        model: meta.model,
        originalRes: `${meta.originalWidth}x${meta.originalHeight}`,
        finalRes: `${meta.upscaledWidth}x${meta.upscaledHeight}`,
        totalTime: `${meta.totalTimeMs}ms`,
        cost: '~$0.0002'
      })
    }

    return { sceneId, imagePath: relativePath }
  } catch (error) {
    console.error(`[Scene ${sceneId}] ❌ Image generation failed:`, error)
    throw new Error(`Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function generateAllSceneImages(videoId: number) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      scenes: {
        where: {
          imagePath: null
        },
        orderBy: { index: 'asc' }
      }
    }
  })

  if (!video) {
    throw new Error('Video not found')
  }

  const results = {
    queued: [] as number[],
    alreadyGenerated: [] as number[],
    failed: [] as { sceneId: number; error: string }[]
  }

  for (const scene of video.scenes) {
    if (scene.imagePath) {
      results.alreadyGenerated.push(scene.id)
      continue
    }

    try {
      console.log(`\n[Video ${videoId}] Processing scene ${scene.index + 1}/${video.scenes.length}`)
      await generateSingleSceneImage(scene.id)
      results.queued.push(scene.id)
      console.log(`[Video ${videoId}] ✅ Scene ${scene.index + 1} complete\n`)
    } catch (error) {
      console.error(`[Video ${videoId}] ❌ Scene ${scene.index + 1} failed:`, error)
      results.failed.push({
        sceneId: scene.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Check for already generated scenes
  const allScenes = await prisma.scene.findMany({
    where: { videoId }
  })

  for (const scene of allScenes) {
    if (scene.imagePath) {
      results.alreadyGenerated.push(scene.id)
    }
  }

  return results
}

export async function generateAllPendingImages() {
  const videos = await prisma.video.findMany({
    where: {
      generationStatus: 'generating'
    },
    include: {
      scenes: true
    }
  })

  const results = {
    success: [] as number[],
    failed: [] as { videoId: number; error: string }[]
  }

  for (const video of videos) {
    try {
      await generateAllSceneImages(video.id)
      results.success.push(video.id)
    } catch (error) {
      results.failed.push({
        videoId: video.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  return results
}

export async function deleteSceneImage(sceneId: number) {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      video: {
        include: { topic: true }
      }
    }
  })

  if (!scene) {
    throw new Error('Scene not found')
  }

  if (!scene.imagePath) {
    throw new Error('No image to delete')
  }

  const sanitizedTitle = sanitizeFolderName(scene.video.topic.title)
  const imageFullPath = path.join(process.cwd(), 'public', 'generations', sanitizedTitle, `scene_${scene.index}`, `${sanitizedTitle}_scene_${scene.index}.png`)

  if (fs.existsSync(imageFullPath)) {
    fs.unlinkSync(imageFullPath)
  }

  await prisma.scene.update({
    where: { id: sceneId },
    data: { imagePath: null }
  })

  return { success: true }
}

export async function generateSceneAudio(sceneId: number) {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      video: {
        include: { topic: true }
      }
    }
  })

  if (!scene) {
    throw new Error('Scene not found')
  }

  if (scene.audioPath) {
    throw new Error('Audio already generated for this scene')
  }

  const sanitizedTitle = sanitizeFolderName(scene.video.topic.title)
  const sceneDir = path.join(GENERATIONS_DIR, sanitizedTitle, `scene_${scene.index}`)
  
  if (!fs.existsSync(sceneDir)) {
    fs.mkdirSync(sceneDir, { recursive: true })
  }

  const audioPath = path.join(sceneDir, `${sanitizedTitle}_scene_${scene.index}.mp3`)
  const generatedPath = await generateNarrationAudio(scene.narration, audioPath)

  const relativePath = generatedPath.replace(path.join(process.cwd(), 'public'), '')

  await prisma.scene.update({
    where: { id: sceneId },
    data: { audioPath: relativePath }
  })

  return { sceneId, audioPath: relativePath }
}

export async function generateAllSceneAudio(videoId: number) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      scenes: {
        orderBy: { index: 'asc' }
      }
    }
  })

  if (!video) {
    throw new Error('Video not found')
  }

  const results = {
    generated: [] as number[],
    skipped: [] as number[],
    failed: [] as { sceneId: number; error: string }[]
  }

  for (const scene of video.scenes) {
    if (scene.audioPath) {
      results.skipped.push(scene.id)
      continue
    }

    try {
      await generateSceneAudio(scene.id)
      results.generated.push(scene.id)
    } catch (error) {
      results.failed.push({
        sceneId: scene.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  return results
}

export async function createIntroScene(videoId: number) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      topic: true,
      scenes: {
        where: { imagePath: { not: null } },
        orderBy: { index: 'asc' }
      }
    }
  })

  if (!video) {
    throw new Error('Video not found')
  }

  if (video.scenes.length === 0) {
    throw new Error('No scenes with generated images found')
  }

  const existingIntro = await prisma.scene.findFirst({
    where: {
      videoId,
      index: 0,
    }
  })

  if (existingIntro) {
    throw new Error('Intro scene already exists')
  }

  const randomScene = video.scenes[Math.floor(Math.random() * video.scenes.length)]
  const sanitizedTitle = video.topic.title.replace(/[^a-zA-Z0-9]/g, '_')
  
  const scene0Dir = path.join(GENERATIONS_DIR, sanitizedTitle, 'scene_0')
  if (!fs.existsSync(scene0Dir)) {
    fs.mkdirSync(scene0Dir, { recursive: true })
  }

  const baseImagePath = path.join(process.cwd(), 'public', randomScene.imagePath!.replace(/^\//, ''))
  const outputPath = path.join(scene0Dir, `${sanitizedTitle}_scene_0.png`)

  const { composeThumbnail } = await import('@/lib/thumbnail/composeThumbnail')
  const composeResult = await composeThumbnail({
    baseImagePath,
    outputPath,
    title: video.topic.title,
  })

  if (!composeResult.success || !composeResult.outputPath) {
    throw new Error(composeResult.error || 'Failed to create intro scene image')
  }

  const relativeImagePath = composeResult.outputPath.replace(path.join(process.cwd(), 'public'), '')

  // Get all existing scenes
  const existingScenes = await prisma.scene.findMany({
    where: { videoId },
    orderBy: { index: 'asc' }
  })

  // Create intro at index 0
  await prisma.scene.create({
    data: {
      videoId,
      index: 0,
      narration: video.topic.title,
      prompt: video.topic.title,
      imagePath: relativeImagePath,
    }
  })

  // Reindex all original scenes to be consecutive starting from 1
  for (let i = 0; i < existingScenes.length; i++) {
    await prisma.scene.update({
      where: { id: existingScenes[i].id },
      data: { index: i + 1 }
    })
  }

  // Get the intro scene to return
  const introScene = await prisma.scene.findFirst({
    where: { videoId, index: 0 }
  })

  if (!introScene) {
    throw new Error('Failed to create intro scene')
  }

  return introScene
}

export async function createIntroSceneWithAudio(videoId: number) {
  const introScene = await createIntroScene(videoId)
  
  await generateSceneAudio(introScene.id)
  
  return introScene
}

export async function updateScene(sceneId: number, narration?: string, prompt?: string) {
  const updateData: { narration?: string; prompt?: string } = {}
  
  if (narration !== undefined) {
    updateData.narration = narration
  }
  if (prompt !== undefined) {
    updateData.prompt = prompt
  }

  const scene = await prisma.scene.update({
    where: { id: sceneId },
    data: updateData,
    include: {
      video: {
        include: { topic: true }
      }
    }
  })

  return scene
}

export async function deleteSceneAudio(sceneId: number) {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      video: {
        include: { topic: true }
      }
    }
  })

  if (!scene) {
    throw new Error('Scene not found')
  }

  if (!scene.audioPath) {
    throw new Error('No audio to delete')
  }

  const audioFullPath = path.join(process.cwd(), 'public', scene.audioPath)

  if (fs.existsSync(audioFullPath)) {
    fs.unlinkSync(audioFullPath)
  }

  await prisma.scene.update({
    where: { id: sceneId },
    data: { audioPath: null }
  })

  return { success: true }
}

export async function generateVideoNarration(videoId: number) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      topic: true,
      scenes: {
        orderBy: { index: 'asc' }
      }
    }
  })

  if (!video) {
    throw new Error('Video not found')
  }

  const sanitizedTitle = sanitizeFolderName(video.topic.title)
  const videoDir = path.join(GENERATIONS_DIR, sanitizedTitle)
  
  if (!fs.existsSync(videoDir)) {
    fs.mkdirSync(videoDir, { recursive: true })
  }

  const narrationPath = path.join(videoDir, `${sanitizedTitle}_narration.mp3`)
  const generatedPath = await generateNarrationAudio(video.narration, narrationPath)

  const relativePath = generatedPath.replace(path.join(process.cwd(), 'public'), '')

  await prisma.video.update({
    where: { id: videoId },
    data: { narrationPath: relativePath }
  })

  return { videoId, narrationPath: relativePath }
}

export async function renderVideo(videoId: number) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      topic: true,
      scenes: {
        orderBy: { index: 'asc' }
      }
    }
  })

  if (!video) {
    throw new Error('Video not found')
  }

  const scenesWithAssets = video.scenes.filter(
    scene => scene.imagePath && scene.audioPath
  )

  if (scenesWithAssets.length === 0) {
    throw new Error('No scenes with both image and audio generated yet')
  }

  if (scenesWithAssets.length !== video.scenes.length) {
    const missingAssets = video.scenes.filter(
      scene => !scene.imagePath || !scene.audioPath
    )
    throw new Error(`Missing assets for ${missingAssets.length} scene(s). Generate all assets first.`)
  }

  const sanitizedTitle = sanitizeFolderName(video.topic.title)
  
  let scenes = scenesWithAssets.map((scene, index) => ({
    image: scene.imagePath!,
    audio: scene.audioPath!,
    narration: scene.narration,
  }))

  const response = await fetch(`${APP_URL}/api/render-video`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scenes, isFullVideo: true }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to render video')
  }

  const result: { jobId?: string; error?: string } = await response.json()

  if (!result.jobId) {
    throw new Error('No job ID returned')
  }

  // Return jobId immediately - frontend will poll
  return { jobId: result.jobId }
}

export async function pollVideoRender(videoId: number, jobId: string) {
  const response = await fetch(`${APP_URL}/api/render-video?jobId=${jobId}`)
  
  if (!response.ok) {
    throw new Error('Failed to check job status')
  }
  
  const job: { status: string; videoUrl?: string; error?: string } = await response.json()
  
  if (job.status === 'completed' && job.videoUrl) {
    await prisma.video.update({
      where: { id: videoId },
      data: {
        videoPath: job.videoUrl,
        generationStatus: 'ready',
      },
    })
    return { success: true, videoUrl: job.videoUrl }
  }
  
  if (job.status === 'failed') {
    throw new Error(job.error || 'Render failed')
  }
  
  return { status: job.status }
}

export async function startRenderSingleScene(sceneId: number) {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      video: {
        include: { topic: true }
      }
    }
  })

  if (!scene) {
    throw new Error('Scene not found')
  }

  if (!scene.imagePath || !scene.audioPath) {
    throw new Error('Scene must have both image and audio generated')
  }

  if (scene.sceneVideoPath) {
    const fullPath = path.join(process.cwd(), 'public', scene.sceneVideoPath.replace(/^\//, ''))
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }
  }
  
  const response = await fetch(`${APP_URL}/api/render-video`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      scenes: [{ 
        image: scene.imagePath, 
        audio: scene.audioPath,
        narration: scene.narration,
      }],
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to render scene')
  }

  const result: { jobId?: string; error?: string } = await response.json()

  if (!result.jobId) {
    throw new Error('No job ID returned')
  }

  return { jobId: result.jobId }
}

export async function pollSingleSceneRender(sceneId: number, jobId: string) {
  const response = await fetch(`${APP_URL}/api/render-video?jobId=${jobId}`)
  
  if (!response.ok) {
    throw new Error('Failed to check job status')
  }
  
  const job: { status: string; videoUrl?: string; error?: string } = await response.json()
  
  if (job.status === 'completed' && job.videoUrl) {
    await prisma.scene.update({
      where: { id: sceneId },
      data: { sceneVideoPath: job.videoUrl },
    })
    return { success: true, videoUrl: job.videoUrl }
  }
  
  if (job.status === 'failed') {
    throw new Error(job.error || 'Render failed')
  }
  
  return { status: job.status }
}

export async function renderAllScenesSequentially(videoId: number) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      scenes: {
        orderBy: { index: 'asc' }
      }
    }
  })

  if (!video) {
    throw new Error('Video not found')
  }

  const scenesWithAssets = video.scenes.filter(
    scene => scene.imagePath && scene.audioPath
  )

  if (scenesWithAssets.length === 0) {
    throw new Error('No scenes with both image and audio generated yet')
  }

  const results: Array<{ sceneId: number; success: boolean; videoUrl?: string; error?: string }> = []

  for (const scene of scenesWithAssets) {
    try {
      if (scene.sceneVideoPath) {
        const fullPath = path.join(process.cwd(), 'public', scene.sceneVideoPath.replace(/^\//, ''))
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath)
        }
      }
      
      const response = await fetch(`${APP_URL}/api/render-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          scenes: [{ 
            image: scene.imagePath, 
            audio: scene.audioPath,
            narration: scene.narration,
          }],
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        results.push({ sceneId: scene.id, success: false, error: error.error || 'Failed to render' })
        continue
      }

      const result: { jobId?: string; error?: string } = await response.json()

      if (!result.jobId) {
        results.push({ sceneId: scene.id, success: false, error: 'No job ID returned' })
        continue
      }

      // Poll for completion
      const job = await pollForCompletion(result.jobId)

      if (job.videoUrl) {
        await prisma.scene.update({
          where: { id: scene.id },
          data: { sceneVideoPath: job.videoUrl },
        })
        results.push({ sceneId: scene.id, success: true, videoUrl: job.videoUrl })
      } else {
        results.push({ sceneId: scene.id, success: false, error: job.error || 'Render failed' })
      }
    } catch (err) {
      results.push({ 
        sceneId: scene.id, 
        success: false, 
        error: err instanceof Error ? err.message : 'Unknown error' 
      })
    }
  }

  return {
    totalScenes: scenesWithAssets.length,
    results,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  }
}

export async function deleteSceneVideo(sceneId: number) {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      video: {
        include: { topic: true }
      }
    }
  })

  if (!scene) {
    throw new Error('Scene not found')
  }

  if (scene.sceneVideoPath) {
    const fullPath = path.join(process.cwd(), 'public', scene.sceneVideoPath.replace(/^\//, ''))
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }
    
    await prisma.scene.update({
      where: { id: sceneId },
      data: { sceneVideoPath: null },
    })
  }

  return { success: true }
}

export async function generateThumbnail(videoId: number) {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  const response = await fetch(`${APP_URL}/api/videos/${videoId}/generate-thumbnail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to generate thumbnail')
  }
  
  const result = await response.json()
  return result
}

export async function generateVideoDescriptionAction(videoId: number) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      topic: true
    }
  })

  if (!video) {
    throw new Error('Video not found')
  }

  const description = await generateVideoDescription(
    video.narration,
    video.title
  )

  await prisma.video.update({
    where: { id: videoId },
    data: { description }
  })

  return { videoId, description }
}

export async function generateFullVideo(videoId: number) {
  const results: {
    imagesGenerated: number;
    introCreated: boolean;
    audioGenerated: number;
    videoCreated: boolean;
    videoRenderComplete: boolean;
    descriptionGenerated: boolean;
  } = {
    imagesGenerated: 0,
    introCreated: false,
    audioGenerated: 0,
    videoCreated: false,
    videoRenderComplete: false,
    descriptionGenerated: false,
  }

  // Step 1: Generate all scene images
  console.log('[FullVideo] Step 1: Generating all scene images...')
  const imageResults = await generateAllSceneImages(videoId)
  results.imagesGenerated = imageResults.queued.length
  console.log('[FullVideo] Generated', results.imagesGenerated, 'images')

  // Step 2: Create intro scene with audio
  console.log('[FullVideo] Step 2: Creating intro scene with audio...')
  const existingIntro = await prisma.scene.findFirst({
    where: { videoId, index: 0 },
  })

  if (!existingIntro) {
    await createIntroSceneWithAudio(videoId)
    results.introCreated = true
    console.log('[FullVideo] Intro scene created with audio')
  } else {
    // Generate audio for intro if not exists
    if (!existingIntro.audioPath) {
      await generateSceneAudio(existingIntro.id)
    }
    results.introCreated = true
    console.log('[FullVideo] Intro scene already exists')
  }

  // Step 3: Generate audio for remaining scenes
  console.log('[FullVideo] Step 3: Generating audio for all scenes...')
  const audioResults = await generateAllSceneAudio(videoId)
  results.audioGenerated = audioResults.generated.length
  console.log('[FullVideo] Generated', results.audioGenerated, 'audio files')

  // Step 4: Combine video and poll for completion
  console.log('[FullVideo] Step 4: Combining video...')
  const renderResult = await renderVideo(videoId)
  results.videoCreated = true
  console.log('[FullVideo] Video render started, jobId:', renderResult.jobId)

  // Poll for render completion
  console.log('[FullVideo] Waiting for video render to complete...')
  const pollInterval = 5000
  const maxAttempts = 720 // 60 minutes max
  let attempts = 0

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, pollInterval))
    
    try {
      const response = await fetch(`${APP_URL}/api/render-video?jobId=${renderResult.jobId}`)
      if (response.ok) {
        const job = await response.json()
        if (job.status === 'completed') {
          results.videoRenderComplete = true
          console.log('[FullVideo] Video render complete!')
          
          // Update video path in database
          if (job.videoUrl) {
            await prisma.video.update({
              where: { id: videoId },
              data: {
                videoPath: job.videoUrl,
                generationStatus: 'ready',
              },
            })
          }
          break
        }
        if (job.status === 'failed') {
          console.error('[FullVideo] Video render failed:', job.error)
          break
        }
      }
    } catch (pollError) {
      console.log('[FullVideo] Poll error, retrying...', pollError)
    }
    attempts++
    console.log('[FullVideo] Render progress...', attempts * pollInterval / 60000, 'minutes')
  }

  // Even if polling failed, check if video was rendered
  if (!results.videoRenderComplete) {
    const video = await prisma.video.findUnique({ where: { id: videoId } })
    if (video?.videoPath) {
      results.videoRenderComplete = true
      console.log('[FullVideo] Video exists in DB despite poll failure')
    }
  }

  // Step 5: Generate description
  console.log('[FullVideo] Step 5: Generating description...')
  const descriptionResult = await generateVideoDescriptionAction(videoId)
  results.descriptionGenerated = true
  console.log('[FullVideo] Description generated')

  return results
}

export async function exportScenesForWindowsRender(videoId: number) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      topic: true,
      scenes: {
        orderBy: { index: 'asc' },
        where: {
          imagePath: { not: null },
          audioPath: { not: null },
        },
      },
    },
  })

  if (!video) {
    throw new Error('Video not found')
  }

  if (video.scenes.length === 0) {
    throw new Error('No scenes with images and audio generated')
  }

  const scenesData = video.scenes.map((scene) => ({
    index: scene.index,
    narration: scene.narration,
    prompt: scene.prompt,
    image: scene.imagePath,
    audio: scene.audioPath,
  }))

  const sanitizedTitle = sanitizeFolderName(video.topic.title)
  const jsonFileName = `${sanitizedTitle}_scenes.json`
  const jsonFilePath = path.join(GENERATIONS_DIR, sanitizedTitle, jsonFileName)

  // Check if JSON file already exists
  let jsonFileExists = fs.existsSync(jsonFilePath)
  let command = ''

  if (jsonFileExists) {
    const wslJsonPath = `\\\\wsl$\\Ubuntu\\home\\nadim\\ytautomation\\public\\generations\\${sanitizedTitle}\\${jsonFileName}`
    command = `node render-gpu.js "${wslJsonPath}"`
  }

  const exportData = {
    title: video.topic.title,
    videoTitle: video.title,
    sceneCount: scenesData.length,
    scenes: scenesData,
    outputPath: `/generations/${sanitizedTitle}/${sanitizedTitle}.mp4`,
    jsonFilePath: `/generations/${sanitizedTitle}/${jsonFileName}`,
    jsonFileExists,
    command,
  }

  return exportData
}

export async function prepareAndExportForWindowsRender(videoId: number) {
  // Step 1: Generate all scene images
  console.log('[WindowsExport] Step 1: Generating all scene images...')
  const imageResults = await generateAllSceneImages(videoId)
  console.log('[WindowsExport] Generated', imageResults.queued.length, 'images')

  // Step 2: Create intro scene with audio
  console.log('[WindowsExport] Step 2: Creating intro scene...')
  const existingIntro = await prisma.scene.findFirst({
    where: { videoId, index: 0 },
  })

  if (!existingIntro) {
    await createIntroSceneWithAudio(videoId)
    console.log('[WindowsExport] Intro scene created with audio')
  } else {
    // Generate audio for intro if not exists
    if (!existingIntro.audioPath) {
      await generateSceneAudio(existingIntro.id)
    }
    console.log('[WindowsExport] Intro scene already exists')
  }

  // Step 3: Generate audio for remaining scenes
  console.log('[WindowsExport] Step 3: Generating audio for all scenes...')
  const audioResults = await generateAllSceneAudio(videoId)
  console.log('[WindowsExport] Generated', audioResults.generated.length, 'audio files')

  // Step 4: Get the export data and save to file
  console.log('[WindowsExport] Step 4: Preparing export data...')
  const exportData = await exportScenesForWindowsRender(videoId)

  // Save JSON file to topic folder
  const sanitizedTitle = sanitizeFolderName(exportData.title)
  const jsonFileName = `${sanitizedTitle}_scenes.json`
  const jsonFilePath = path.join(GENERATIONS_DIR, sanitizedTitle, jsonFileName)
  
  fs.writeFileSync(jsonFilePath, JSON.stringify(exportData, null, 2))
  
  // Generate the Windows command - point to WSL mount path
  const wslJsonPath = `\\\\wsl$\\Ubuntu\\home\\nadim\\ytautomation\\public\\generations\\${sanitizedTitle}\\${jsonFileName}`
  const command = `node render-gpu.js "${wslJsonPath}"`

  return {
    ...exportData,
    command,
    jsonFilePath: `/generations/${sanitizedTitle}/${jsonFileName}`,
    imagesGenerated: imageResults.queued.length,
    audioGenerated: audioResults.generated.length,
    introCreated: true,
  }
}

export async function prepareAndExportForLongFormRender(videoId: number) {
  // Step 1: Generate all scene images (skip intro - long form doesn't have intro)
  console.log('[LongFormExport] Step 1: Generating all scene images...')
  const imageResults = await generateAllSceneImages(videoId)
  console.log('[LongFormExport] Generated', imageResults.queued.length, 'images')

  // Step 2: Generate audio for all scenes (no intro scene)
  console.log('[LongFormExport] Step 2: Generating audio for all scenes...')
  const audioResults = await generateAllSceneAudio(videoId)
  console.log('[LongFormExport] Generated', audioResults.generated.length, 'audio files')

  // Step 3: Get the scenes data
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      topic: true,
      scenes: {
        orderBy: { index: 'asc' },
        where: {
          imagePath: { not: null },
          audioPath: { not: null },
        },
      },
    },
  })

  if (!video) {
    throw new Error('Video not found')
  }

  if (video.scenes.length === 0) {
    throw new Error('No scenes with images and audio generated')
  }

  // Step 4: Create JSON file for long form (different filename)
  const scenesData = video.scenes.map((scene) => ({
    index: scene.index,
    narration: scene.narration,
    prompt: scene.prompt,
    image: scene.imagePath,
    audio: scene.audioPath,
  }))

  const sanitizedTitle = sanitizeFolderName(video.topic.title)
  const jsonFileName = `${sanitizedTitle}_scenes.json`
  const jsonFilePath = path.join(GENERATIONS_DIR, sanitizedTitle, jsonFileName)

  const exportData = {
    title: video.topic.title,
    videoTitle: video.title,
    sceneCount: scenesData.length,
    scenes: scenesData,
    outputPath: `/generations/${sanitizedTitle}/${sanitizedTitle}.mp4`,
    jsonFilePath: `/generations/${sanitizedTitle}/${jsonFileName}`,
  }

  // Save JSON file
  fs.writeFileSync(jsonFilePath, JSON.stringify(exportData, null, 2))

  // Generate the Windows command
  const wslJsonPath = `\\\\wsl$\\Ubuntu\\home\\nadim\\ytautomation\\public\\generations\\${sanitizedTitle}\\${jsonFileName}`
  const command = `node render-gpu-longform.js "${wslJsonPath}"`

  return {
    ...exportData,
    command,
    jsonFilePath: `/generations/${sanitizedTitle}/${jsonFileName}`,
    imagesGenerated: imageResults.queued.length,
    audioGenerated: audioResults.generated.length,
  }
}

export async function getWindowsRenderCommand(videoId: number) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { topic: true }
  })

  if (!video) {
    return null
  }

  const sanitizedTitle = sanitizeFolderName(video.topic.title)
  const jsonFileName = `${sanitizedTitle}_scenes.json`
  const jsonFilePath = path.join(GENERATIONS_DIR, sanitizedTitle, jsonFileName)

  if (!fs.existsSync(jsonFilePath)) {
    return null
  }

  const wslJsonPath = `\\\\wsl$\\Ubuntu\\home\\nadim\\ytautomation\\public\\generations\\${sanitizedTitle}\\${jsonFileName}`
  const command = `node render-gpu.js "${wslJsonPath}"`
  const jsonFilePathWeb = `/generations/${sanitizedTitle}/${jsonFileName}`

  return {
    command,
    jsonFilePath: jsonFilePathWeb,
  }
}

export async function getAllVideosWithWindowsRenderStatus() {
  const videos = await prisma.video.findMany({
    where: {
      narration: {
        not: '',
      },
      topic: {
        reviewCompleted: false,
      },
    },
    include: {
      topic: true,
      scenes: {
        orderBy: {
          index: 'asc',
        },
      },
    },
    orderBy: {
      id: 'desc',
    },
  })

  const videosWithStatus = await Promise.all(
    videos.map(async (video) => {
      const windowsRender = await getWindowsRenderCommand(video.id)
      
      // Check if Windows video file exists on disk
      const sanitizedTitle = sanitizeFolderName(video.topic.title)
      const windowsVideoPath = `/generations/${sanitizedTitle}/${sanitizedTitle}.mp4`
      const fullWindowsVideoPath = path.join(process.cwd(), 'public', windowsVideoPath.replace(/^\//, ''))
      const windowsVideoExists = fs.existsSync(fullWindowsVideoPath)
      
      // If Windows video exists but DB status is not ready, update it
      if (windowsVideoExists && video.generationStatus !== 'ready') {
        await prisma.video.update({
          where: { id: video.id },
          data: { generationStatus: 'ready' }
        })
        video.generationStatus = 'ready'
      }
      
      return {
        ...video,
        hasWindowsRender: !!windowsRender,
        windowsRenderCommand: windowsRender?.command || null,
        windowsRenderPath: windowsRender?.jsonFilePath || null,
        windowsVideoExists,
        windowsVideoPath: windowsVideoExists ? windowsVideoPath : null,
      }
    })
  )

  return videosWithStatus
}

export async function markTopicReviewCompleted(topicId: number, completed: boolean = true) {
  const topic = await prisma.topic.update({
    where: { id: topicId },
    data: { reviewCompleted: completed },
  })
  return topic
}

// ============================================================
// FULL AUTOMATION - Generate images, audio, and JSON for all pending videos
// ============================================================

interface AutomationResult {
  success: boolean
  videoId: number
  title: string
  imagesGenerated: number
  audioGenerated: number
  jsonCreated: boolean
  error?: string
}

/**
 * Automate full pipeline: Generate images, audio, and create JSON for a single video
 */
export async function automateVideoAssets(videoId: number): Promise<AutomationResult> {
  const startTime = Date.now()
  
  try {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { topic: true, scenes: true }
    })
    
    if (!video) {
      return { success: false, videoId, title: 'Unknown', imagesGenerated: 0, audioGenerated: 0, jsonCreated: false, error: 'Video not found' }
    }
    
    console.log(`[Automate] Processing video ${videoId}: ${video.title}`)
    
    // Step 1: Generate all scene images
    console.log(`[Automate] Generating images for video ${videoId}...`)
    const imageResults = await generateAllSceneImages(videoId)
    console.log(`[Automate] Generated ${imageResults.queued.length} images for video ${videoId}`)
    
    // Step 2: Create intro scene with audio if doesn't exist
    const existingIntro = await prisma.scene.findFirst({
      where: { videoId, index: 0 },
    })
    
    if (!existingIntro) {
      await createIntroSceneWithAudio(videoId)
      console.log(`[Automate] Created intro scene for video ${videoId}`)
    } else if (!existingIntro.audioPath) {
      await generateSceneAudio(existingIntro.id)
      console.log(`[Automate] Generated intro audio for video ${videoId}`)
    }
    
    // Step 3: Generate audio for all remaining scenes
    console.log(`[Automate] Generating audio for video ${videoId}...`)
    const audioResults = await generateAllSceneAudio(videoId)
    console.log(`[Automate] Generated ${audioResults.generated.length} audio files for video ${videoId}`)
    
    // Step 4: Create JSON file for Windows renderer
    console.log(`[Automate] Creating JSON for video ${videoId}...`)
    const exportData = await exportScenesForWindowsRender(videoId)
    
    // Save JSON file
    const sanitizedTitle = sanitizeFolderName(exportData.title)
    const jsonFileName = `${sanitizedTitle}_scenes.json`
    const jsonFilePath = path.join(GENERATIONS_DIR, sanitizedTitle, jsonFileName)
    fs.writeFileSync(jsonFilePath, JSON.stringify(exportData, null, 2))
    console.log(`[Automate] Created JSON file: ${jsonFilePath}`)
    
    const duration = Date.now() - startTime
    console.log(`[Automate] Video ${videoId} completed in ${(duration / 1000).toFixed(1)}s`)
    
    return {
      success: true,
      videoId,
      title: video.title,
      imagesGenerated: imageResults.queued.length,
      audioGenerated: audioResults.generated.length,
      jsonCreated: true
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Automate] Failed for video ${videoId}:`, errorMsg)
    
    return {
      success: false,
      videoId,
      title: 'Unknown',
      imagesGenerated: 0,
      audioGenerated: 0,
      jsonCreated: false,
      error: errorMsg
    }
  }
}

/**
 * Automate all pending videos - generates images, audio, and JSON files
 */
export async function automateAllPendingVideos(): Promise<{
  processed: AutomationResult[]
  total: number
  successful: number
  failed: number
}> {
  console.log('[AutomateAll] Starting automation for all pending videos...')
  
  // Find all videos that need processing (have narration but missing assets)
  const videos = await prisma.video.findMany({
    where: {
      narration: { not: '' },
      topic: { reviewCompleted: false }
    },
    include: { 
      topic: true,
      scenes: true 
    },
    orderBy: { id: 'asc' }
  })
  
  // Filter videos that need processing (missing images or audio)
  const videosNeedingProcessing = videos.filter(video => {
    const hasMissingImages = video.scenes.some(s => !s.imagePath)
    const hasMissingAudio = video.scenes.some(s => !s.audioPath)
    const hasIntro = video.scenes.some(s => s.index === 0)
    const introHasAudio = video.scenes.find(s => s.index === 0)?.audioPath
    
    return hasMissingImages || hasMissingAudio || !hasIntro || !introHasAudio
  })
  
  console.log(`[AutomateAll] Found ${videosNeedingProcessing.length} videos needing processing out of ${videos.length} total`)
  
  const results: AutomationResult[] = []
  
  for (const video of videosNeedingProcessing) {
    const result = await automateVideoAssets(video.id)
    results.push(result)
    
    // Small delay between videos to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  const successful = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  
  console.log(`[AutomateAll] Completed: ${successful} successful, ${failed} failed out of ${results.length} videos`)
  
  return {
    processed: results,
    total: results.length,
    successful,
    failed
  }
}

/**
 * Create a batch render list file for Windows renderer
 * This generates a JSON file with all pending video paths
 */
export async function createBatchRenderList(): Promise<{
  batchFilePath: string
  videoCount: number
  videos: { title: string; jsonPath: string; outputPath: string }[]
}> {
  console.log('[BatchRender] Creating batch render list...')
  
  // Find all videos that have JSON files ready but no rendered video
  const videos = await prisma.video.findMany({
    where: {
      narration: { not: '' },
      topic: { reviewCompleted: false }
    },
    include: { topic: true },
    orderBy: { id: 'asc' }
  })
  
  const videosReady: { title: string; jsonPath: string; outputPath: string }[] = []
  
  for (const video of videos) {
    const sanitizedTitle = sanitizeFolderName(video.topic.title)
    const jsonFileName = `${sanitizedTitle}_scenes.json`
    const jsonPath = path.join(GENERATIONS_DIR, sanitizedTitle, jsonFileName)
    const videoPath = path.join(GENERATIONS_DIR, sanitizedTitle, `${sanitizedTitle}.mp4`)
    
    // Check if JSON exists and video doesn't exist yet
    if (fs.existsSync(jsonPath) && !fs.existsSync(videoPath)) {
      videosReady.push({
        title: video.topic.title,
        jsonPath: `\\\\wsl$\\Ubuntu\\home\\nadim\\ytautomation\\public\\generations\\${sanitizedTitle}\\${jsonFileName}`,
        outputPath: `/generations/${sanitizedTitle}/${sanitizedTitle}.mp4`
      })
    }
  }
  
  // Create batch render list file
  const batchListPath = path.join(process.cwd(), 'public', 'batch-render-list.json')
  const batchData = {
    createdAt: new Date().toISOString(),
    totalVideos: videosReady.length,
    videos: videosReady
  }
  
  fs.writeFileSync(batchListPath, JSON.stringify(batchData, null, 2))
  
  console.log(`[BatchRender] Created batch list with ${videosReady.length} videos`)
  
  return {
    batchFilePath: '/batch-render-list.json',
    videoCount: videosReady.length,
    videos: videosReady
  }
}

/**
 * Get automation status for all videos
 */
export async function getAutomationStatus(): Promise<{
  totalVideos: number
  withScripts: number
  withImages: number
  withAudio: number
  withJson: number
  withFinalVideo: number
  pending: { id: number; title: string; status: string }[]
}> {
  const videos = await prisma.video.findMany({
    where: { topic: { reviewCompleted: false } },
    include: { topic: true, scenes: true },
    orderBy: { id: 'desc' }
  })
  
  const withScripts = videos.filter(v => v.narration && v.narration !== '').length
  const withImages = videos.filter(v => v.scenes.every(s => s.imagePath)).length
  const withAudio = videos.filter(v => v.scenes.every(s => s.audioPath)).length
  
  let withJson = 0
  let withFinalVideo = 0
  const pending: { id: number; title: string; status: string }[] = []
  
  for (const video of videos) {
    const sanitizedTitle = sanitizeFolderName(video.topic.title)
    const jsonPath = path.join(GENERATIONS_DIR, sanitizedTitle, `${sanitizedTitle}_scenes.json`)
    const videoPath = path.join(GENERATIONS_DIR, sanitizedTitle, `${sanitizedTitle}.mp4`)
    
    if (fs.existsSync(jsonPath)) withJson++
    if (fs.existsSync(videoPath)) {
      withFinalVideo++
    } else if (video.narration) {
      // Determine status
      const missingImages = video.scenes.filter(s => !s.imagePath).length
      const missingAudio = video.scenes.filter(s => !s.audioPath).length
      
      let status = 'Ready to render'
      if (missingImages > 0) status = `Needs ${missingImages} images`
      else if (missingAudio > 0) status = `Needs ${missingAudio} audio`
      else if (!fs.existsSync(jsonPath)) status = 'Needs JSON'
      
      pending.push({
        id: video.id,
        title: video.title,
        status
      })
    }
  }
  
  return {
    totalVideos: videos.length,
    withScripts,
    withImages,
    withAudio,
    withJson,
    withFinalVideo,
    pending: pending.slice(0, 10) // Return top 10 pending
  }
}

/**
 * Clean up duplicate videos for the same topic in a batch
 * Keeps only the most recent video per topic (by topicId or by topic title)
 */
export async function cleanupDuplicateBatchVideos(batchId: string): Promise<{
  deleted: number
  kept: number
  errors: string[]
}> {
  console.log(`[Cleanup] Starting duplicate cleanup for batch ${batchId}`)

  const videos = await prisma.video.findMany({
    where: { batchId },
    include: { topic: true, scenes: true },
    orderBy: { id: 'desc' } // Most recent first
  })

  console.log(`[Cleanup] Found ${videos.length} videos in batch`)
  videos.forEach(v => {
    console.log(`[Cleanup] Video ${v.id}: topicId=${v.topicId}, title="${v.topic?.title || v.title}"`)
  })

  // Method 1: Deduplicate by topicId
  const seenTopicIds = new Set<number>()
  const toDeleteByTopicId: number[] = []

  for (const video of videos) {
    if (seenTopicIds.has(video.topicId)) {
      console.log(`[Cleanup] Marking video ${video.id} as duplicate by topicId (topicId ${video.topicId})`)
      toDeleteByTopicId.push(video.id)
    } else {
      seenTopicIds.add(video.topicId)
    }
  }

  // Method 2: Deduplicate by topic title (for cases where topics have same title but different IDs)
  const seenTitles = new Set<string>()
  const toDeleteByTitle: number[] = []

  // Reset and check by title (normalize title for comparison)
  const normalizedTitles = new Set<string>()
  for (const video of videos) {
    const title = (video.topic?.title || video.title || '').toLowerCase().trim()
    if (title && normalizedTitles.has(title)) {
      console.log(`[Cleanup] Marking video ${video.id} as duplicate by title: "${title}"`)
      toDeleteByTitle.push(video.id)
    } else if (title) {
      normalizedTitles.add(title)
    }
  }

  // Combine both lists (avoid duplicates in toDelete)
  const toDelete = [...new Set([...toDeleteByTopicId, ...toDeleteByTitle])]
  const errors: string[] = []

  console.log(`[Cleanup] Found ${toDelete.length} total duplicates (${toDeleteByTopicId.length} by topicId, ${toDeleteByTitle.length} by title)`)

  if (toDelete.length === 0) {
    console.log('[Cleanup] No duplicates found')
    return {
      deleted: 0,
      kept: videos.length,
      errors: []
    }
  }

  // Delete duplicates
  for (const videoId of toDelete) {
    try {
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: { scenes: true }
      })
      
      if (video) {
        // Delete associated files (don't fail if files don't exist)
        try {
          for (const scene of video.scenes) {
            if (scene.imagePath) {
              const imagePath = path.join(process.cwd(), 'public', scene.imagePath.replace(/^\//, ''))
              if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath)
                console.log(`[Cleanup] Deleted image: ${imagePath}`)
              }
            }
            if (scene.audioPath) {
              const audioPath = path.join(process.cwd(), 'public', scene.audioPath.replace(/^\//, ''))
              if (fs.existsSync(audioPath)) {
                fs.unlinkSync(audioPath)
                console.log(`[Cleanup] Deleted audio: ${audioPath}`)
              }
            }
          }
        } catch (fileError) {
          console.error(`[Cleanup] File deletion error for video ${videoId}:`, fileError)
          // Continue even if file deletion fails
        }
        
        // Delete video and scenes from database
        console.log(`[Cleanup] Deleting video ${videoId} with ${video.scenes.length} scenes`)
        await prisma.scene.deleteMany({ where: { videoId } })
        await prisma.video.delete({ where: { id: videoId } })
        console.log(`[Cleanup] Deleted video ${videoId}`)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[Cleanup] Failed to delete video ${videoId}:`, errorMsg)
      errors.push(`Failed to delete video ${videoId}: ${errorMsg}`)
    }
  }
  
  const result = {
    deleted: toDelete.length,
    kept: videos.length - toDelete.length,
    errors
  }
  
  console.log(`[Cleanup] Complete: ${result.deleted} deleted, ${result.kept} kept`)
  return result
}

const IMAGE_STYLES: Record<string, { keywords: string; quality: string }> = {
  anime: {
    keywords: 'anime style, manga artwork, cel-shaded, anime key visual, Japanese anime',
    quality: 'masterpiece, best quality, highly detailed, 8k, cinematic lighting, vibrant colors'
  },
  realistic: {
    keywords: 'photorealistic, realistic, lifelike, natural lighting, detailed photography',
    quality: 'ultra realistic, 8k, photorealistic, detailed texture, professional photography'
  },
  mystical: {
    keywords: 'mystical, fantasy art, magical, ethereal, enchanted, otherworldly',
    quality: 'masterpiece, best quality, fantasy art, detailed, cinematic lighting, mystical atmosphere'
  },
  cyberpunk: {
    keywords: 'cyberpunk, futuristic, neon, sci-fi, dystopian, high tech',
    quality: 'cyberpunk art, neon lights, sci-fi, detailed, 8k, cinematic'
  },
  watercolor: {
    keywords: 'watercolor painting, watercolor art, soft colors, artistic, painterly',
    quality: 'watercolor, artistic, beautiful colors, detailed, gallery quality'
  },
  oil_painting: {
    keywords: 'oil painting, classical painting, fine art, Renaissance style, brush strokes',
    quality: 'oil painting, classical art, detailed, museum quality, artistic'
  },
  digital_art: {
    keywords: 'digital art, concept art, illustration, digital painting, modern art',
    quality: 'digital art, masterpiece, best quality, detailed illustration, vibrant'
  },
  '3d_render': {
    keywords: '3D render, CGI, 3D illustration, computer graphics, Blender',
    quality: '3D render, CGI, photorealistic, octane render, detailed, 8k'
  }
}

function getImageStyleKeywords(style: string): { keywords: string; quality: string } {
  return IMAGE_STYLES[style] || IMAGE_STYLES.anime
}

export async function generateLongFormScenes(videoId: number, imageStyle: string = 'anime'): Promise<{ success: boolean; message: string }> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { scenes: { orderBy: { index: 'asc' } } }
  })

  if (!video) {
    throw new Error('Video not found')
  }

  if (!video.scenes || video.scenes.length === 0) {
    throw new Error('No scenes found. Please generate scenes first.')
  }

  const results = {
    imagesGenerated: 0,
    imagesFailed: 0,
    audioGenerated: 0,
    audioFailed: 0
  }

  for (const scene of video.scenes) {
    if (!scene.imagePath) {
      try {
        console.log(`\n[Video ${videoId}] Generating image for scene ${scene.index + 1}/${video.scenes.length}`)
        await generateSingleSceneImage(scene.id)
        results.imagesGenerated++
        console.log(`[Video ${videoId}] ✅ Scene ${scene.index + 1} image generated\n`)
      } catch (error) {
        console.error(`[Video ${videoId}] ❌ Scene ${scene.index + 1} image failed:`, error)
        results.imagesFailed++
      }
    }

    if (!scene.audioPath) {
      try {
        console.log(`\n[Video ${videoId}] Generating audio for scene ${scene.index + 1}/${video.scenes.length}`)
        await generateSceneAudio(scene.id)
        results.audioGenerated++
        console.log(`[Video ${videoId}] ✅ Scene ${scene.index + 1} audio generated\n`)
      } catch (error) {
        console.error(`[Video ${videoId}] ❌ Scene ${scene.index + 1} audio failed:`, error)
        results.audioFailed++
      }
    }
  }

  return { 
    success: true, 
    message: `Generated ${results.imagesGenerated} images (${results.imagesFailed} failed), ${results.audioGenerated} audio (${results.audioFailed} failed)` 
  }
}

export async function fixScenePrompts(videoId: number, imageStyle: string = 'anime'): Promise<{ success: boolean; message: string }> {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
  const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
  
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured')
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { scenes: { orderBy: { index: 'asc' } } }
  })

  if (!video) {
    throw new Error('Video not found')
  }

  const scenes = video.scenes
  if (scenes.length === 0) {
    throw new Error('No scenes found for this video')
  }

  const styleInfo = getImageStyleKeywords(imageStyle)

  const scenesText = scenes.map(s => 
    `Scene ${s.index}: "${s.narration}"`
  ).join('\n')

  const models = getAllMetadataModels()
  let lastError: Error | null = null

  for (const model of models) {
    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content: `You are an expert at creating image prompts for AI image generation.

Your task is to rewrite image prompts based on the narration and a specific image style.

CRITICAL RULES:
- Describe what you SEE in the scene - character, setting, lighting, mood
- NEVER include narration text in the prompt
- Format: [SUBJECT], [SETTING], [LIGHTING], [MOOD], [DETAILS]
- ALWAYS include: ${styleInfo.keywords}
- Quality tags: ${styleInfo.quality}
- Keep each prompt concise but detailed (50-100 words)

Output ONLY valid JSON:
{
  "prompts": [
    {"sceneIndex": 1, "prompt": "string - visual description"}
  ]
}`
        },
        {
          role: 'user',
          content: `Rewrite the image prompts for each scene based on the narration and style: ${imageStyle}

SCENES:
${scenesText}

Requirements:
- For each scene, create a visual prompt describing what you SEE
- Include: ${styleInfo.keywords}
- Add: ${styleInfo.quality}
- Keep prompts 50-100 words
- Describe: subject, setting, lighting, mood, details

Output ONLY valid JSON with the structure specified in the system prompt.`
        }
      ],
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('No content returned from AI')
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Invalid JSON response from AI')
  }

  const parsed = JSON.parse(jsonMatch[0])
  const promptsData = parsed.prompts || []

  if (!Array.isArray(promptsData) || promptsData.length === 0) {
    throw new Error('No prompts returned from AI')
  }

  // Update each scene with the new prompt
  let updatedCount = 0
  for (const promptData of promptsData) {
    const scene = scenes.find(s => s.index === promptData.sceneIndex)
    if (scene) {
      await prisma.scene.update({
        where: { id: scene.id },
        data: { prompt: promptData.prompt }
      })
      updatedCount++
    }
  }

  return { success: true, message: `Fixed prompts for ${updatedCount} scenes` }
    } catch (err) {
      console.error(`Model ${model} failed:`, err instanceof Error ? err.message : String(err))
      lastError = err as Error
    }
  }

  throw lastError || new Error('All models failed')
}
