// POST /api/scenes/[id]/generate-video
// Generates a video for a single scene using Lightning AI LTX-Video via Gradio API.
// Reads videoMotionPrompt as the generation prompt, maps audio duration to duration option.
// Saves the downloaded video to the scene folder and updates scene.sceneVideoPath in DB.
export const maxDuration = 600 // 10 minutes max (Lightning can take a while)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateLightningVideo, mapDuration } from '@/lib/videoService'
import path from "path"
import { existsSync, mkdirSync } from "fs"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sceneId = parseInt(id, 10)
    if (!Number.isFinite(sceneId)) {
      return NextResponse.json({ error: 'Invalid scene id' }, { status: 400 })
    }

    // ─── Load scene with topic + series ──────────────────────────────────────
    const scene = await prisma.scene.findUnique({
      where: { id: sceneId },
      include: {
        video: {
          include: {
            topic: {
              include: {
                series: {
                  select: {
                    contentMode: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!scene) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 })
    }

    if (!scene.videoMotionPrompt) {
      return NextResponse.json({ error: 'No video motion prompt on this scene' }, { status: 400 })
    }

    // ─── Determine aspect ratio from series contentMode ──────────────────────
    const series = scene.video.topic.series
    const lightningEndpoint = (series as any)?.lightningEndpoint || undefined
    const contentMode = series?.contentMode ?? 'long'
    const aspectRatio = contentMode === 'shorts' ? '9:16' : '16:9'

    // ─── Duration from audio duration (seconds) ──────────────────────────────
    let targetDuration = 5 // default
    if (scene.audioPath) {
      // TODO: read actual audio duration from file using sharp-audio-metadata or ffprobe
      // For now, use a heuristic based on narration length
      const narrationLen = scene.narration.split(' ').length
      targetDuration = Math.max(2, Math.min(10, Math.round(narrationLen / 3)))
    }
    const duration = mapDuration(targetDuration)

    // ─── Output folder: /public/generations/{topicTitle}/scene_{index}/ ─────
    const topicTitle = scene.video.topic.title.replace(/[^a-zA-Z0-9_-]/g, '_')
    const sceneFolder = path.join(
      process.cwd(), 'public', 'generations',
      topicTitle, `scene_${scene.index}`
    )
    if (!existsSync(sceneFolder)) {
      mkdirSync(sceneFolder, { recursive: true })
    }

    // ─── Call Lightning ──────────────────────────────────────────────────────
    console.log(`[generate-video] scene=${sceneId} prompt="${scene.videoMotionPrompt.slice(0, 60)}..." duration=${duration} aspect=${aspectRatio}`)

    const result = await generateLightningVideo(
      {
        prompt: scene.videoMotionPrompt,
        duration,
        aspectRatio: aspectRatio as any,
        resolution: '720p',
        guideScale: 3,
        numSteps: 8,
        seed: -1,
      },
      sceneFolder,
      lightningEndpoint,
    )

    // ─── Update DB ──────────────────────────────────────────────────────────
    // Convert local path to public URL path
    const publicVideoPath = result.videoPath.replace(process.cwd() + '/public', '')
    await prisma.scene.update({
      where: { id: sceneId },
      data: { sceneVideoPath: publicVideoPath },
    })

    return NextResponse.json({
      ok: true,
      sceneId,
      videoPath: publicVideoPath,
      subtitlePath: result.subtitlePath
        ? result.subtitlePath.replace(process.cwd() + '/public', '')
        : null,
      duration,
      aspectRatio,
    })

  } catch (error: any) {
    console.error(`[generate-video] scene=${(await params).id} error:`, error)
    return NextResponse.json(
      { error: error.message || 'Video generation failed' },
      { status: 500 }
    )
  }
}
