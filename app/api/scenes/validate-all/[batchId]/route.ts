// POST /api/scenes/validate-all/[batchId] — validate + repair every scene's
// image prompt in a batch. Walks all topics → all scenes → all video.scenes
// and runs the deterministic template + sanitizer pipeline against each.
//
// Why this exists:
//   - Per-scene Validate button works but doesn't scale for batches of 50+
//     scenes (50 individual clicks).
//   - This endpoint bulk-processes the whole batch in one request with
//     bounded latency (sequential, ~50ms per scene for the template path).
//
// Body: { dryRun?: boolean } — when true, computes validated prompts but
// does NOT save them.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { buildImagePrompt } from '@/lib/promptSanitizer'
import { buildSceneFromNarration } from '@/lib/sceneTemplate'

// Allow longer route execution. 50 scenes × ~50ms template + ~5ms DB write
// = ~3s baseline, plus latency for processing real prompts.
export const maxDuration = 120

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params
    const batchIdInt = parseInt(batchId, 10)
    if (!Number.isFinite(batchIdInt)) {
      return NextResponse.json({ error: 'Invalid batchId' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const dryRun: boolean = !!body?.dryRun

    // Load batch → topics → videos → scenes with the series art style.
    const batch = await prisma.topicBatch.findUnique({
      where: { id: batchIdInt },
      include: {
        topics: {
          orderBy: { id: 'asc' },
          include: {
            video: {
              include: {
                scenes: { orderBy: { index: 'asc' } },
              },
            },
            series: {
              include: { artStyle: true, niche: true },
            },
          },
        },
      },
    })
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })

    const artStyleName: string = batch.topics[0]?.series?.artStyle?.name || 'Photorealism'
    const artStyleSuffix: string = batch.topics[0]?.series?.artStyle?.promptSuffix || ''
    const nicheCategory: string = batch.topics[0]?.series?.niche?.category || 'general'

    // Walk every scene in the batch.
    const updates: Array<{
      sceneId: number
      sceneIndex: number
      topicId: number
      topicTitle: string
      artStyleName: string
      changed: boolean
      oldLength: number
      newLength: number
      error?: string
    }> = []

    let processed = 0
    let failed = 0

    for (const topic of batch.topics) {
      if (!topic.video) continue
      const scenes = topic.video.scenes
      if (scenes.length === 0) continue

      // Each topic uses its own series config in case different series share a batch.
      const topicArtStyleSuffix = (topic.series as any)?.artStyle?.promptSuffix || artStyleSuffix
      const topicPromptKeywords = (topic.series as any)?.artStyle?.promptKeywords || ''
      const topicPromptQuality = (topic.series as any)?.artStyle?.promptQuality || ''
      const topicArtStyleName = (topic.series as any)?.artStyle?.name || artStyleName

      for (const scene of scenes) {
        try {
          const oldPrompt = scene.prompt || ''
          const sceneBody = buildSceneFromNarration({
            sceneIndex: scene.index,
            sceneCount: scenes.length,
            narration: scene.narration || '',
            artStyleName: topicArtStyleName,
          })
          const { prompt: validatedPrompt } = buildImagePrompt({
            artStyleSuffix: topicArtStyleSuffix,
            promptKeywords: topicPromptKeywords,
            promptQuality: topicPromptQuality,
            scenePrompt: sceneBody,
          })

          const changed = validatedPrompt !== oldPrompt
          if (!dryRun && changed) {
            await prisma.scene.update({
              where: { id: scene.id },
              data: { prompt: validatedPrompt },
            })
          }

          updates.push({
            sceneId: scene.id,
            sceneIndex: scene.index,
            topicId: topic.id,
            topicTitle: topic.title,
            artStyleName: topicArtStyleName,
            changed,
            oldLength: oldPrompt.length,
            newLength: validatedPrompt.length,
          })
          processed++
        } catch (e: any) {
          failed++
          updates.push({
            sceneId: scene.id,
            sceneIndex: scene.index,
            topicId: topic.id,
            topicTitle: topic.title,
            artStyleName: topicArtStyleName,
            changed: false,
            oldLength: scene.prompt?.length || 0,
            newLength: 0,
            error: e.message,
          })
        }
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      batchId: batchIdInt,
      artStyleName,
      totalScenes: processed + failed,
      processed,
      failed,
      changedCount: updates.filter(u => u.changed).length,
      updates,
    })
  } catch (error: any) {
    console.error('[validate-all] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
