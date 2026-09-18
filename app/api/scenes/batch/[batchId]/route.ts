// GET /api/scenes/batch/[batchId] — list all topics in a TopicBatch with scene status
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

// Check if a video.mp4 already exists in the topic's generation folder.
// Returns the public URL path if found, else null.
function detectRenderedVideoUrl(scenes: Array<{ imagePath?: string | null }>): string | null {
  const first = scenes.find(s => !!s.imagePath)
  if (!first || !first.imagePath) return null
  // imagePath looks like: /generations/<Title>/scene_0/<file>.png
  // Strip from the FIRST /scene_N/ onwards so we get the topic folder.
  const idx = first.imagePath.search(/\/scene_\d+\//)
  if (idx < 0) return null
  const topicFolder = first.imagePath.slice(0, idx)
  const videoPath = path.join(process.cwd(), 'public', topicFolder.replace(/^\//, ''), 'video.mp4')
  if (fs.existsSync(videoPath)) {
    return `${topicFolder}/video.mp4`
  }
  return null
}
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params
    const batchIdInt = parseInt(batchId, 10)
    if (!Number.isFinite(batchIdInt)) {
      return NextResponse.json({ error: 'Invalid batchId' }, { status: 400 })
    }

    const batch = await prisma.topicBatch.findUnique({
      where: { id: batchIdInt },
      include: {
        topics: {
          orderBy: { id: 'asc' },
          include: {
            video: {
              include: {
                scenes: {
                  orderBy: { index: 'asc' },
                  select: { id: true, index: true, narration: true, prompt: true, imagePath: true, audioPath: true, sceneVideoPath: true },
                },
              },
            },
            series: {
              select: {
                id: true,
                seriesName: true,
                videoDuration: true,
                contentMode: true,
                niche: { select: { id: true, category: true } },
                artStyle: { select: { id: true, name: true, promptSuffix: true } },
                sceneStyles: { select: { id: true, sceneType: true, name: true, prompt: true } },
              },
            },
          },
        },
      },
    })

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }

    return NextResponse.json({
      batch: {
        id: batch.id,
        name: batch.baseTopic,
        createdAt: batch.createdAt,
        topics: batch.topics.map(t => {
          const series = t.series as any
          const scenes = t.video?.scenes ?? []
          return {
            id: t.id,
            title: t.title,
            fullStory: t.fullStory,
            sourceType: t.sourceType,
            sourceUrl: t.sourceUrl,
            sourceViews: t.sourceViews,
            sourceDuration: t.sourceDuration,
            sourceTranscript: t.sourceTranscript,
            seriesId: t.seriesId,
            seriesName: t.series?.seriesName,
            seriesDurationBucket: series?.videoDuration ?? null,
            seriesContentMode: series?.contentMode ?? null,
            nicheCategory: series?.niche?.category ?? null,
            artStyleName: series?.artStyle?.name ?? null,
            videoId: t.video?.id ?? null,
            sceneCount: scenes.length,
            imagesReady: scenes.filter((s: any) => !!s.imagePath).length,
            audiosReady: scenes.filter((s: any) => !!s.audioPath).length,
            hasStory: !!(t.fullStory || t.sourceTranscript),
            // Detect an existing rendered video on disk so the View Video button
            // appears immediately on page load, not just after a fresh render.
            renderedVideoUrl: detectRenderedVideoUrl(scenes),
            scenes,
          }
        }),
      },
    })
  } catch (error: any) {
    console.error('[scenes/batch] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
