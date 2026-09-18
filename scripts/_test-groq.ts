import { buildScenePrompts } from '../lib/promptStyles'

async function tryModel(model: string, sys: ReturnType<typeof buildScenePrompts>): Promise<{ok: boolean; time: number; content?: string; err?: string}> {
  const start = Date.now()
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: sys.system },
        { role: 'user', content: sys.user },
      ],
      temperature: 0.95,
      max_tokens: 500,
      stream: false,
    }),
  })
  const ms = Date.now() - start
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, time: ms, err: `HTTP ${res.status}: ${body.slice(0, 200)}` }
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content || ''
  return { ok: !!content, time: ms, content }
}

async function main() {
  const sys = buildScenePrompts('Creepy Comic', { narration: 'Meilin woke screaming. The Labubu doll was sitting on her chest, laughing wider than before.', niche: 'Horror', seed: Date.now() })
  console.log('system:', sys.system.length, 'chars | user:', sys.user.length, 'chars')

  for (const model of ['allam-2-7b', 'groq/compound-mini', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b']) {
    const r = await tryModel(model, sys)
    if (r.ok) {
      console.log(`\n=== ${model} OK time=${r.time}ms content_len=${r.content!.length} ===`)
      console.log(r.content!.slice(0, 600))
    } else {
      console.log(`\n=== ${model} FAIL time=${r.time}ms err=${r.err} ===`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
