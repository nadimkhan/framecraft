import { buildScenePrompts } from '../lib/promptStyles'

async function main() {
  const narration = process.argv[2] || 'test'
  const sys = buildScenePrompts('Creepy Comic', { narration, niche: 'Horror', seed: Date.now() })
  console.log('system:', sys.system.length, 'chars | user:', sys.user.length, 'chars')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)
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
    console.log('content_len:', content.length)
    console.log('--- content ---')
    console.log(content.slice(0, 600))
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
