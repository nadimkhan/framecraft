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

    // ─── Load scene with topic + series + art style ──────────────────────────
    const scene = await prisma.scene.findUnique({
      where: { id: sceneId },
      include: {
        video: {
          include: {
            topic: {
              include: {
                series: {
                  include: {
                    artStyle: true,
                  },
                  select: {
                    lightningEndpoint: true,
                    contentMode: true,
                    artStyleId: true,
                    nicheId: true,
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

    const series = scene.video.topic.series
    if (!series) {
      return NextResponse.json({ error: 'Series not found for scene' }, { status: 500 })
    }
    const lightningEndpoint = series.lightningEndpoint || undefined

    // ─── Resolve art style: series override → niche default ───────────────────
    // Niche.defaultArtStyleId is a column FK, not a relation field — fetch it directly
    const niche = await prisma.niche.findUnique({
      where: { id: series.nicheId },
      select: { defaultArtStyleId: true },
    })
    const artStyleId = series.artStyleId ?? niche?.defaultArtStyleId
    const artStyle = artStyleId
      ? await prisma.artStyle.findUnique({
          where: { id: artStyleId },
          select: { name: true, promptSuffix: true, promptKeywords: true },
        })
      : null

    const styleLabel = artStyle
      ? `${artStyle.name} illustration, ${artStyle.promptKeywords || artStyle.promptSuffix}`
      : ''

    // ─── Enrich prompt with art style ────────────────────────────────────────
    // Structure: "<style name> <style keywords>. <original videoMotionPrompt>"
    const enrichedPrompt = styleLabel
      ? `${styleLabel}. ${scene.videoMotionPrompt}`
      : scene.videoMotionPrompt

    console.log(`[generate-video] scene=${sceneId} artStyle=${artStyle?.name || 'none'} prompt="${enrichedPrompt.slice(0, 80)}..."`)

    // ─── Duration from audio duration (seconds) ────────────────────────────────
    let targetDuration = 5
    if (scene.audioPath) {
      const narrationLen = scene.narration.split(' ').length
      targetDuration = Math.max(2, Math.min(10, Math.round(narrationLen / 3)))
    }
    const duration = mapDuration(targetDuration)

    // ─── Aspect ratio from series contentMode ─────────────────────────────────
    const contentMode = series.contentMode ?? 'long'
    const aspectRatio = contentMode === 'shorts' ? '9:16' : '16:9'

    // ─── Output folder ───────────────────────────────────────────────────────
    const topicTitle = scene.video.topic.title.replace(/[^a-zA-Z0-9_-]/g, '_')
    const sceneFolder = path.join(
      process.cwd(), 'public', 'generations',
      topicTitle, `scene_${scene.index}`
    )
    if (!existsSync(sceneFolder)) {
      mkdirSync(sceneFolder, { recursive: true })
    }

    // ─── Call Lightning ───────────────────────────────────────────────────────
    const result = await generateLightningVideo(
      {
        prompt: enrichedPrompt,
        duration,
        aspectRatio: aspectRatio as "16:9" | "4:3" | "1:1" | "3:4" | "9:16",
        resolution: '720p',
        guideScale: 3,
        numSteps: 8,
        seed: -1,
      },
      sceneFolder,
      lightningEndpoint,
    )

    // ─── Update DB ──────────────────────────────────────────────────────────
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
      artStyle: artStyle?.name ?? null,
    })

  } catch (error: any) {
    console.error(`[generate-video] scene=${(await params).id} error:`, error)
    return NextResponse.json(
      { error: error.message || 'Video generation failed' },
      { status: 500 }
    )
  }
}
