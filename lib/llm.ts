/**
 * Unified LLM provider for all routes that need text generation.
 *
 * Order of providers (each has its own fallback chain):
 *   1. Groq (primary) — fast, reliable, free tier with generous limits.
 *   2. Kira (fallback) — only kira-mini-1.0 actually free; everything else Pro-only.
 *   3. Omniroute (last resort) — local gateway, was unreliable historically.
 *
 * Each provider has a `models` array tried in order. The first model to
 * return 200 + non-empty content wins. Failures are logged with [groq]/[kira]
 * prefixes so terminal output makes the active provider obvious.
 *
 * ENV:
 *   GROQ_API_KEY        — Groq API key (https://console.groq.com)
 *   GROQ_MODELS         — comma-separated Groq model IDs (override default chain)
 *   KIRA_API_KEY        — Kira API key (https://kiraai.vn)
 *   KIRA_BASE_URL       — default https://kiraai.vn/api/v1
 *   KIRA_MODELS         — comma-separated Kira model IDs (override default chain)
 *   OMNIROUTE_BASE_URL  — local Omniroute gateway (default http://localhost:20128/v1)
 *   OMNIROUTE_API_KEY   — optional
 *   OMNIROUTE_MODELS    — comma-separated Omniroute models
 */

const GROQ_BASE = 'https://api.groq.com/openai/v1'
const GROQ_KEY = process.env.GROQ_API_KEY || ''
const GROQ_DEFAULT_MODELS = [
  'qwen/qwen3.8-27b',       // fast + accurate + multimodal
  'groq/compound-mini',     // Groq native, json_mode
  'allam-2-7b',             // ultra-fast, smaller context
]

const KIRA_BASE = process.env.KIRA_BASE_URL || 'https://kiraai.vn/api/v1'
const KIRA_KEY = process.env.KIRA_API_KEY || ''
const KIRA_DEFAULT_MODELS = ['kira-mini-1.0']

const OMNIROUTE_BASE = process.env.OMNIROUTE_BASE_URL || 'http://localhost:20128/v1'
const OMNIROUTE_KEY = process.env.OMNIROUTE_API_KEY || ''
const OMNIROUTE_DEFAULT_MODELS = [
  'auto/best-free',
  'auto/best-chaos',
  'auto/llama',
  'auto/zai',
  'auto/auto',
]

function parseList(envValue: string, defaults: string[]): string[] {
  if (!envValue) return defaults
  return envValue.split(',').map(s => s.trim()).filter(Boolean)
}

interface ProviderResult {
  content: string
  provider: string
  model: string
  latencyMs: number
}

async function tryOpenAICompat(
  base: string,
  key: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number; responseFormatJson?: boolean } = {},
  logTag: string,
): Promise<ProviderResult | null> {
  const { temperature = 0.9, maxTokens = 2000, timeoutMs = 25_000, responseFormatJson = false } = opts
  if (!key) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const t0 = Date.now()
  try {
    const body: Record<string, any> = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }
    if (responseFormatJson) {
      body.response_format = { type: 'json_object' }
    }
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const ms = Date.now() - t0

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error(`[${logTag}] model=${model} HTTP ${res.status} time=${ms}ms body=${errBody.slice(0, 200)}`)
      return null
    }
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    if (!content) {
      console.error(`[${logTag}] model=${model} empty content time=${ms}ms usage=${JSON.stringify(data.usage)}`)
      return null
    }
    console.log(`[${logTag}] model=${model} OK time=${ms}ms content_len=${content.length}`)
    return { content, provider: logTag, model, latencyMs: ms }
  } catch (e: any) {
    const ms = Date.now() - t0
    console.error(`[${logTag}] model=${model} EXCEPTION time=${ms}ms name=${e?.name} msg=${e?.message?.slice(0, 200)}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Try each provider in order until one returns content. Logs which provider
 * succeeded. Returns null only if ALL providers AND ALL their models failed.
 */
export async function generateText(
  systemPrompt: string,
  userPrompt: string,
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number; responseFormatJson?: boolean } = {},
): Promise<ProviderResult | null> {
  const groqModels = parseList(process.env.GROQ_MODELS || '', GROQ_DEFAULT_MODELS)
  const kiraModels = parseList(process.env.KIRA_MODELS || '', KIRA_DEFAULT_MODELS)
  const omnirouteModels = parseList(process.env.OMNIROUTE_MODELS || '', OMNIROUTE_DEFAULT_MODELS)

  // 1. Groq primary
  if (GROQ_KEY) {
    for (const model of groqModels) {
      const r = await tryOpenAICompat(GROQ_BASE, GROQ_KEY, model, systemPrompt, userPrompt, opts, 'groq')
      if (r) return r
    }
    console.warn('[generateText] All Groq models failed, falling back to Kira')
  }

  // 2. Kira fallback
  if (KIRA_KEY) {
    for (const model of kiraModels) {
      const r = await tryOpenAICompat(KIRA_BASE, KIRA_KEY, model, systemPrompt, userPrompt, opts, 'kira')
      if (r) return r
    }
    console.warn('[generateText] All Kira models failed, falling back to Omniroute')
  }

  // 3. Omniroute last resort
  if (OMNIROUTE_KEY) {
    for (const model of omnirouteModels) {
      const r = await tryOpenAICompat(OMNIROUTE_BASE, OMNIROUTE_KEY, model, systemPrompt, userPrompt, opts, 'omniroute')
      if (r) return r
    }
  }

  console.error('[generateText] ALL providers failed')
  return null
}

export const _providers = { GROQ_BASE, KIRA_BASE, OMNIROUTE_BASE }
