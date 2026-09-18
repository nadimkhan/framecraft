import { buildScenePrompts } from '../lib/promptStyles'

async function main() {
  const sys = buildScenePrompts('Creepy Comic', { narration: 'A pale girl in a school uniform clutches a cracked porcelain doll in a flooded basement.', niche: 'Horror', seed: Date.now() })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  const start = Date.now()
  try {
    const res = await fetch(process.env.KIRA_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.KIRA_API_KEY },
      body: JSON.stringify({
        model: 'kira-mini-1.0',
        messages: [
          { role: 'system', content: sys.system },
          { role: 'user', content: sys.user },
        ],
        temperature: 0.95,
        max_tokens: 900,
        stream: false,
      }),
      signal: controller.signal,
    })
    console.log('HTTP:', res.status, 'TIME:', (Date.now() - start) / 1000 + 's')
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    console.log('content length:', content.length)
    console.log('--- content (first 800) ---')
    console.log(content.slice(0, 800))
    console.log('--- usage ---')
    console.log(JSON.stringify(data.usage))
    if (data.error) console.log('ERROR:', JSON.stringify(data.error))
  } catch (e: any) {
    console.log('EXCEPTION:', e.name, e.message, 'after', (Date.now() - start) / 1000 + 's')
  } finally {
    clearTimeout(timer)
  }
}
main()
