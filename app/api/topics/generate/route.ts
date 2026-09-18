// POST /api/topics/generate — generate titles + full stories via AI
// Primary: Kira (kiraai.vn) — works reliably, no rate limits like Omniroute free tier
// Fallback: Omniroute auto/* chain
import { NextRequest, NextResponse } from 'next/server'

// Allow longer route execution for multi-model fallback chain.
export const maxDuration = 300

interface GeneratedTopic {
  title: string
  fullStory: string
}

// Provider order: Groq (primary, fast + free) → Kira (fallback) → Omniroute (last resort).
const GROQ_BASE = 'https://api.groq.com/openai/v1'
const GROQ_KEY = process.env.GROQ_API_KEY || ''
const GROQ_MODELS = [
  'qwen/qwen3.8-27b',
  'groq/compound-mini',
  'allam-2-7b',
]

const KIRA_BASE = process.env.KIRA_BASE_URL || 'https://kiraai.vn/api/v1'
const KIRA_KEY = process.env.KIRA_API_KEY || ''
// Only kira-mini-1.0 is truly free for this account — others require Pro membership.
const KIRA_MODELS = ['kira-mini-1.0']

const OMNIROUTE_BASE = process.env.OMNIROUTE_BASE_URL || 'http://localhost:20128/v1'
const OMNIROUTE_KEY = process.env.OMNIROUTE_API_KEY || ''

// Omniroute fallback chain (used only if Groq + Kira fail)
const OMNIROUTE_MODELS = [
  'auto/best-free',
  'auto/best-chaos',
  'auto/chat',
  'auto/coding:free',
  'auto/fast',
  'auto/cheap',
  'auto/zai',
  'auto/llama',
]

const NICHE_KEYWORDS: Record<string, string> = {
  Horror: 'horror',
  Comedy: 'comedy',
  Finance: 'finance',
  Gaming: 'gaming',
  Motivation: 'motivation',
}

function buildPrompt(niche: string, count: number, contentMode: string): string {
  const isLong = contentMode === 'long_form'
  const storyLength = isLong ? '600-900 words' : '100-180 words'

  return `You are a ${niche} short-form content writer. Output ONLY a JSON array.

Generate exactly ${count} original ${isLong ? 'long-form story' : 'short story'} titles with full narration scripts.

Format (return ONLY this, no markdown, no preamble):
[{"title":"Compelling Title","fullStory":"Narration text here, vivid spoken-word style. Hook in first line. ${storyLength}."}]

Requirements:
- Each title unique, click-worthy
- ${storyLength} per story
- Spoken narration style
- Hook in first 3 seconds
- Safe for YouTube

JSON array only:`
}

function extractJsonArray(text: string): any[] | null {
  if (!text) return null
  let cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed
  } catch { /* fall through */ }
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1))
      if (Array.isArray(parsed)) return parsed
    } catch { /* fall through */ }
  }
  return null
}

interface ProviderConfig {
  base: string
  key: string
  authHeader: 'Bearer' | 'skip'
}

async function tryProvider(
  cfg: ProviderConfig,
  model: string,
  prompt: string,
  timeoutMs: number
): Promise<{ ok: boolean; content: string; error?: string; provider: string; model: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const providerName = cfg.base.includes('kiraai') ? 'kira'
    : cfg.base.includes('groq') ? 'groq'
    : 'omniroute'
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (cfg.authHeader !== 'skip' && cfg.key) {
      headers['Authorization'] = `Bearer ${cfg.key}`
    }
    const response = await fetch(`${cfg.base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        max_tokens: 4000,
        stream: false,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      return { ok: false, content: '', error: `HTTP ${response.status}: ${errText.slice(0, 200)}`, provider: providerName, model }
    }

    const raw = await response.text()
    try {
      const data = JSON.parse(raw)
      const content = data.choices?.[0]?.message?.content || data.content?.[0]?.text || data.response || ''
      return { ok: !!content, content, provider: providerName, model }
    } catch {
      // SSE fallback
      const lines = raw.split('\n')
      let content = ''
      for (const line of lines) {
        const t = line.trim()
        if (!t.startsWith('data:')) continue
        const data = t.slice(5).trim()
        if (data === '[DONE]') break
        try {
          const evt = JSON.parse(data)
          const delta = evt.choices?.[0]?.delta?.content || evt.choices?.[0]?.message?.content
          if (delta && !delta.includes('"error"')) content += delta
        } catch { /* skip */ }
      }
      return { ok: !!content, content, provider: providerName, model }
    }
  } catch (e: any) {
    return {
      ok: false, content: '',
      error: e.name === 'AbortError' ? 'timeout' : e.message,
      provider: providerName, model,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { niche, nicheName, count, contentMode, seriesId } = await request.json()

    if (!niche || !count) {
      return NextResponse.json({ error: 'niche and count required' }, { status: 400 })
    }

    const actualCount = Math.min(Math.max(parseInt(count), 1), 20)
    const mode = contentMode === 'long_form' ? 'long_form' : 'shorts'
    const nicheKey = NICHE_KEYWORDS[nicheName || niche] || 'general'
    const prompt = buildPrompt(nicheKey, actualCount, mode)

    const errors: string[] = []

    // ─── Try Groq (primary) — fast free tier with generous limits ──────
    if (GROQ_KEY) {
      for (const model of GROQ_MODELS) {
        console.log(`[generate] trying groq:${model}`)
        const result = await tryProvider(
          { base: GROQ_BASE, key: GROQ_KEY, authHeader: 'Bearer' },
          model, prompt, 30_000
        )
        if (!result.ok || !result.content) {
          console.log(`[generate] groq:${model} failed: ${result.error || 'empty'}`)
          errors.push(`${result.provider}:${model}: ${result.error || 'no content'}`)
          continue
        }
        const topics = extractJsonArray(result.content)
        if (!topics || topics.length === 0) {
          console.log(`[generate] groq:${model} unparseable (${result.content.length} chars)`)
          errors.push(`${result.provider}:${model}: unparseable JSON`)
          continue
        }
        const valid = topics.filter((t: any) =>
          typeof t?.title === 'string' && typeof t?.fullStory === 'string'
        ) as GeneratedTopic[]
        if (valid.length === 0) {
          errors.push(`${result.provider}:${model}: missing title/fullStory`)
          continue
        }
        console.log(`[generate] groq:${model} success with ${valid.length} topics`)
        return NextResponse.json({
          topics: valid,
          contentMode: mode,
          count: valid.length,
          provider: 'groq',
          model,
        })
      }
    } else {
      errors.push('groq: no GROQ_API_KEY set')
    }

    // ─── Try Kira (fallback) ────────────────────────────────────────────
    if (KIRA_KEY) {
      for (const model of KIRA_MODELS) {
        if (!model) continue
        console.log(`[generate] trying kira:${model}`)
        const result = await tryProvider(
          { base: KIRA_BASE, key: KIRA_KEY, authHeader: 'Bearer' },
          model, prompt, 30_000
        )
        if (!result.ok || !result.content) {
          console.log(`[generate] kira:${model} failed: ${result.error || 'empty'}`)
          errors.push(`${result.provider}:${model}: ${result.error || 'no content'}`)
          continue
        }
        const topics = extractJsonArray(result.content)
        if (!topics || topics.length === 0) {
          console.log(`[generate] kira:${model} unparseable (${result.content.length} chars)`)
          errors.push(`${result.provider}:${model}: unparseable JSON`)
          continue
        }
        const valid = topics.filter((t: any) =>
          typeof t?.title === 'string' && typeof t?.fullStory === 'string'
        ) as GeneratedTopic[]
        if (valid.length === 0) {
          errors.push(`${result.provider}:${model}: missing title/fullStory`)
          continue
        }
        console.log(`[generate] kira:${model} success with ${valid.length} topics`)
        return NextResponse.json({
          topics: valid,
          contentMode: mode,
          count: valid.length,
          provider: 'kira',
          model,
        })
      }
    } else {
      errors.push('kira: no KIRA_API_KEY set')
    }

    // ─── Fallback to Omniroute ───────────────────────────────────────────
    if (OMNIROUTE_KEY || true) { // omniroute works without key too
      for (const model of OMNIROUTE_MODELS) {
        console.log(`[generate] trying omniroute:${model}`)
        const result = await tryProvider(
          { base: OMNIROUTE_BASE, key: OMNIROUTE_KEY, authHeader: 'Bearer' },
          model, prompt, 60_000
        )
        if (!result.ok || !result.content) {
          errors.push(`${result.provider}:${model}: ${result.error || 'no content'}`)
          continue
        }
        const topics = extractJsonArray(result.content)
        if (!topics || topics.length === 0) {
          errors.push(`${result.provider}:${model}: unparseable`)
          continue
        }
        const valid = topics.filter((t: any) =>
          typeof t?.title === 'string' && typeof t?.fullStory === 'string'
        ) as GeneratedTopic[]
        if (valid.length === 0) {
          errors.push(`${result.provider}:${model}: invalid items`)
          continue
        }
        console.log(`[generate] omniroute:${model} success with ${valid.length} topics`)
        return NextResponse.json({
          topics: valid,
          contentMode: mode,
          count: valid.length,
          provider: 'omniroute',
          model,
        })
      }
    }

    // ─── All providers failed ───────────────────────────────────────────
    const summary = errors.slice(-3).join(' | ').slice(0, 400)
    return NextResponse.json({
      error: `All AI providers failed (${errors.length} attempts). Last errors: ${summary}`,
      errors,
      hint: 'Wait 30-60 seconds and retry. If persistent, check Kira/Omniroute service status.',
    }, { status: 502 })
  } catch (error: any) {
    console.error('Generate topics error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
