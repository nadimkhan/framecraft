// POST /api/scenes/[id]/validate-prompt — audit + repair the scene's image prompt.
//
// Strategy (Sept 2026): rebuild the prompt FROM THE NARRATION using a
// deterministic template (lib/sceneTemplate). This is more reliable than an
// LLM call because:
//   1. The output is GUARANTEED to be 7 sentences in the correct structure
//   2. The narration is the literal source for subject + action
//   3. No LLM = no hallucinated style cues, no context bleed
//   4. Style-first ordering ensures image models weight the style correctly
//   5. ~5ms per scene vs 1-5 seconds for an LLM call
//
// The output goes through buildImagePrompt which prepends the canonical
// ArtStyle.promptSuffix (style-first ordering) so MiniMax gets the style
// at the START of the prompt where it weights most.
//
// Body: { dryRun?: boolean } — when true, computes the validated prompt but
// does NOT save it. UI uses this to preview what "Validate" will produce.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { buildImagePrompt } from '@/lib/promptSanitizer'
import { buildSceneFromNarration } from '@/lib/sceneTemplate'

// Allow longer route execution — drift check + DB write.
export const maxDuration = 30

const ART_STYLE_DRIFT_TOKENS: Record<string, string[]> = {
  'Creepy Comic': ['photorealistic', 'photorealism', 'realistic', '3d render', 'cinematic still'],
  'Photorealism': ['comic', 'manga', 'anime', 'cel-shaded', 'cartoon'],
  'Anime':         ['photorealistic', '3d render', 'oil painting', 'photograph'],
  'Ghibli':        ['photorealistic', '3d render', 'photograph'],
  'Pixel Art':     ['photorealistic', 'cinematic', 'photograph', 'oil painting'],
  'Modern Cartoon':['photorealistic', 'cinematic', 'oil painting', 'photograph'],
  'Disney':        ['photorealistic', '3d render', 'oil painting'],
  'Lego':          ['photorealistic', 'oil painting', 'photograph'],
  'Mythology':     ['photorealistic', 'anime', 'manga', 'cel-shaded'],
  'Painting':      ['photorealistic', 'cinematic still', 'photograph', '3d render'],
  'Dark Fantasy':  ['photorealistic', 'cinematic', 'photograph'],
  'Polaroid':      ['comic', 'manga', 'cel-shaded'],
  'Fantasy':       ['photorealistic', '3d render', 'photograph'],
}

interface DriftReport {
  driftedTokens: string[]
  sentenceCount: number
  hasIssues: boolean
}

function detectDrift(validatedSceneBody: string, artStyleName: string): DriftReport {
  const driftTokens = ART_STYLE_DRIFT_TOKENS[artStyleName] ?? []
  const lower = validatedSceneBody.toLowerCase()
  const driftedTokens = driftTokens.filter(t => lower.includes(t))

  const sentenceCount = validatedSceneBody
    .split(/[.!?]+\s+/)
    .map(s => s.trim())
    .filter(Boolean).length

  return {
    driftedTokens,
    sentenceCount,
    hasIssues: driftedTokens.length > 0 || sentenceCount < 3,
  }
}

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

    const body = await request.json().catch(() => ({}))
    const dryRun: boolean = !!body?.dryRun

    const scene = await prisma.scene.findUnique({
      where: { id: sceneId },
      include: {
        video: {
          include: {
            scenes: { select: { index: true } },
            topic: {
              include: {
                series: { include: { artStyle: true, niche: true } },
              },
            },
          },
        },
      },
    })
    if (!scene) return NextResponse.json({ error: 'Scene not found' }, { status: 404 })

    const series = scene.video.topic.series as any
    const artStyleName: string = series?.artStyle?.name || 'Photorealism'
    const artStyleSuffix: string = series?.artStyle?.promptSuffix || ''
    const promptKeywords: string = series?.artStyle?.promptKeywords || ''
    const promptQuality: string = series?.artStyle?.promptQuality || ''
    const nicheCategory: string = series?.niche?.category || 'general'

    // Build scene description deterministically from the narration.
    // Faster + more reliable than an LLM call — guaranteed 7-sentence structure,
    // literal subject extraction from narration, no hallucination risk.
    const sceneBody = buildSceneFromNarration({
      sceneIndex: scene.index,
      sceneCount: scene.video.scenes?.length ?? 1,
      narration: scene.narration || '',
      artStyleName,
      fullStory: scene.video.topic?.fullStory || scene.video.topic?.sourceTranscript || '',
    })

    // Run through the sanitizer to strip any drift tokens + append canonical suffix.
    // The sanitizer also runs enforceHierarchySentence + stripStyleFragments as
    // belt-and-suspenders, but since our template output is already clean, these
    // are essentially no-ops.
    const { prompt: validatedPrompt, cleanScene } = buildImagePrompt({
      artStyleSuffix,
      promptKeywords,
      promptQuality,
      scenePrompt: sceneBody,
    })

    // Drift check on the scene-only body (suffix is canonical, exempt).
    const drift = detectDrift(cleanScene, artStyleName)

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        sceneId,
        artStyleName,
        provider: 'template',
        narration: scene.narration,
        generatedSceneBody: sceneBody,
        cleanScene,
        validatedPrompt,
        drift,
        changed: validatedPrompt !== scene.prompt,
      })
    }

    // Save the validated prompt back to the DB so future image generation uses it.
    const updated = await prisma.scene.update({
      where: { id: sceneId },
      data: { prompt: validatedPrompt },
    })

    return NextResponse.json({
      ok: true,
      sceneId: updated.id,
      artStyleName,
      provider: 'template',
      prompt: updated.prompt,
      drift,
      changed: validatedPrompt !== scene.prompt,
    })
  } catch (error: any) {
    console.error('[validate-prompt] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
