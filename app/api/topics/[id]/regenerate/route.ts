// POST /api/topics/[id]/regenerate — regenerate the AI story text for a topic
// Useful when the user wants fresh variations of the same title/niche.
// Body: { nicheName?, count?, contentMode? }
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateText } from '@/lib/llm'

// Allow longer route execution for multi-provider fallback chain.
export const maxDuration = 300

const NICHE_KEYWORDS: Record<string, string> = {
  Horror: 'horror',
  Comedy: 'comedy',
  Finance: 'finance',
  Gaming: 'gaming',
  Motivation: 'motivation',
}

function buildPrompt(niche: string, title: string, count: number, contentMode: string): string {
  const isLong = contentMode === 'long_form'
  const storyLength = isLong ? '600-900 words' : '150-300 words'

  return `You are a ${niche} short-form content writer. Output ONLY a JSON object.

Generate exactly 1 fresh, original ${isLong ? 'long-form' : 'short'} story for this title: "${title}"

Output ONLY valid JSON in this exact format (no markdown, no preamble):
{
  "title": "${title}",
  "story": "<complete narrative, ${storyLength}, vivid spoken-word style, with a hook in the first sentence>"
}

Requirements:
- Hook the reader in the first 1-2 sentences
- Vivid sensory details and emotional beats
- Self-contained story with satisfying conclusion
- Spoken narration style — clear, vivid, suitable for voice-over
- Safe for YouTube (no explicit content)

JSON object only, no other text:`
}

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
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch { /* fall through */ }
  }
  return null
}

async function callLLM(prompt: string, systemPrompt: string): Promise<string | null> {
  const result = await generateText(systemPrompt, prompt, { temperature: 0.9, maxTokens: 2500 })
  return result?.content || null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const topicId = parseInt(id, 10)
    if (!Number.isFinite(topicId)) {
      return NextResponse.json({ error: 'Invalid topic id' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const nicheName = (body?.nicheName as string) || 'general'
    const contentMode = (body?.contentMode as string) || 'shorts'
    const niche = NICHE_KEYWORDS[nicheName] || nicheName.toLowerCase()

    const topic = await prisma.topic.findUnique({ where: { id: topicId } })
    if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })

    const systemPrompt = 'You are a creative short-form video script writer. Return ONLY valid JSON with no markdown, no explanation.'
    const prompt = buildPrompt(niche, topic.title, 1, contentMode)

    const content = await callLLM(prompt, systemPrompt)
    if (!content) {
      return NextResponse.json(
        { error: 'All LLM providers failed' },
        { status: 502 }
      )
    }

    const parsed = extractJsonObject(content)
    if (!parsed?.story) {
      return NextResponse.json(
        { error: 'Failed to parse regenerated story from LLM response' },
        { status: 500 }
      )
    }

    const newStory = String(parsed.story).trim()

    // Update the topic with the regenerated fullStory
    const updated = await prisma.topic.update({
      where: { id: topicId },
      data: {
        fullStory: newStory,
        // Also refresh scenes from the new story
        // First delete existing scenes (will be regenerated on next scene-generation call)
      },
    })

    return NextResponse.json({
      ok: true,
      topicId: updated.id,
      title: updated.title,
      fullStory: newStory,
    })
  } catch (error: any) {
    console.error('[regenerate] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
