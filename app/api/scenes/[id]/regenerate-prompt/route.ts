// POST /api/scenes/[id]/regenerate-prompt — regenerate image prompt for a single scene
// Uses the scene's existing narration as input. The system prompt + user template
// come from lib/promptStyles.ts — the same design spec used during scene generation.
// Only updates scene.prompt — narration stays the same.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { buildScenePrompts } from '@/lib/promptStyles'
import { generateText } from '@/lib/llm'

// Allow longer route execution for multi-provider fallback chain.
// Without this, Next.js dev server aborts at ~60s.
export const maxDuration = 300 // 5 minutes for full chain

function extractJsonObject(text: string): any | null {
  if (!text) return null
  let cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    const p = JSON.parse(cleaned)
    if (p && typeof p === 'object') return p
  } catch { /* fall through */ }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)) }
    catch { /* fall through */ }
  }
  return null
}

async function callLLM(prompt: string, systemPrompt: string): Promise<{ content: string; provider: string; model: string } | null> {
  const result = await generateText(systemPrompt, prompt, { temperature: 0.95, maxTokens: 900 })
  return result ? { content: result.content, provider: result.provider, model: result.model } : null
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

    const scene = await prisma.scene.findUnique({
      where: { id: sceneId },
      include: {
        video: {
          include: {
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
    const artStyleSuffix = series?.artStyle?.promptSuffix || ''
    const nicheCategory: string = series?.niche?.category || 'general'

    // Use the central design system. Each style has its own:
    //   - system prompt (visual treatment, environment bank, negative list)
    //   - user template (scene context + 4 environment options rotated per seed)
    const seed = Date.now() + sceneId  // varied seed so consecutive regenerations differ
    const { system: systemPrompt, user: userPrompt, spec } = buildScenePrompts(
      artStyleName,
      { narration: scene.narration, niche: nicheCategory, seed }
    )

    const llmResult = await callLLM(userPrompt, systemPrompt)
    if (!llmResult) {
      const sysLen = systemPrompt.length
      const userLen = userPrompt.length
      console.error(`[regenerate-prompt] ALL FAILED sceneId=${sceneId} artStyle=${artStyleName} niche=${nicheCategory} sys_len=${sysLen} user_len=${userLen}`)
      return NextResponse.json({
        error: 'All LLM providers failed',
        details: {
          sceneId,
          artStyle: artStyleName,
          niche: nicheCategory,
          promptSizes: { system: sysLen, user: userLen },
        },
      }, { status: 502 })
    }

    const parsed = extractJsonObject(llmResult.content)
    if (!parsed?.prompt) {
      return NextResponse.json(
        { error: 'Failed to parse regenerated prompt from LLM response' },
        { status: 500 }
      )
    }

    // Apply the sanitizer (strips LLM-hallucinated style cues + prepends canonical suffix)
    const { buildImagePrompt } = await import('@/lib/promptSanitizer')
    const { prompt: finalPrompt } = buildImagePrompt({
      artStyleSuffix,
      scenePrompt: String(parsed.prompt),
    })

    // Update the scene
    const updated = await prisma.scene.update({
      where: { id: sceneId },
      data: { prompt: finalPrompt },
    })

    return NextResponse.json({
      ok: true,
      sceneId: updated.id,
      prompt: updated.prompt,
    })
  } catch (error: any) {
    console.error('[regenerate-prompt] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
