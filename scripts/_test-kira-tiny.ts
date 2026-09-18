async function main() {
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
          { role: 'system', content: 'Return ONLY valid JSON like {\"prompt\":\"text\"}.' },
          { role: 'user', content: 'Generate a 30-word image prompt for: A pale girl holding a cracked doll in a flooded basement.' },
        ],
        temperature: 0.95,
        max_tokens: 200,
        stream: false,
      }),
      signal: controller.signal,
    })
    console.log('HTTP:', res.status, 'TIME:', (Date.now() - start) / 1000 + 's')
    const data = await res.json()
    console.log('--- response ---')
    console.log(JSON.stringify(data).slice(0, 1000))
  } catch (e: any) {
    console.log('EXCEPTION:', e.name, e.message, 'after', (Date.now() - start) / 1000 + 's')
  } finally {
    clearTimeout(timer)
  }
}
main()
