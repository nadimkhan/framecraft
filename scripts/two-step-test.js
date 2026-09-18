require('dotenv').config()

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'stepfun/step-3.5-flash:free'
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

if (!OPENROUTER_API_KEY) {
  console.error('Missing OPENROUTER_API_KEY')
  process.exit(1)
}

async function generateNarration(topicTitle) {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3001',
      'X-Title': 'YT Shorts Automation'
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { 
          role: 'system', 
          content: 'You are a viral YouTube Shorts script writer. Generate engaging, conversational scripts.' 
        },
        { 
          role: 'user', 
          content: `Generate a viral YouTube Shorts script for: "${topicTitle}"

Requirements:
- Total duration: 45-55 seconds MAX
- Scene count: 6 scenes
- EACH scene narration: 10-15 words - make it sound natural and conversational
- Write engaging, human-sounding content
- Hook viewers immediately
- End with call-to-action

Output ONLY valid JSON like:
{
  "title": "...",
  "scenes": [
    {"index": 1, "narration": "..."}
  ]
}` 
        }
      ],
      temperature: 0.8,
      max_tokens: 2000
    })
  })

  const data = await response.json()
  return data.choices?.[0]?.message?.content
}

async function generateImagePrompt(narration) {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3001',
      'X-Title': 'YT Shorts Automation'
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { 
          role: 'system', 
          content: `You are an AI image prompt expert. Convert scene narrations into anime concept art image prompts.

RULES:
- Describe what VISUAL SCENE would match this narration
- Include: character + background/setting + lighting + mood
- Style: anime concept art, manga style, cel-shaded
- Quality: masterpiece, best quality, highly detailed, 8k, cinematic lighting
- NEVER repeat the narration words in the prompt
- Keep it visual: show, don't tell`
        },
        { 
          role: 'user', 
          content: `Convert this narration into an anime image prompt:

Narration: "${narration}"

Output ONLY the image prompt (no quotes, just the prompt text):` 
        }
      ],
      temperature: 0.7,
      max_tokens: 300
    })
  })

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim()
}

// Test
const topic = process.argv[2] || 'productivity tips for students'

console.log(`Topic: ${topic}\n`)
console.log('Step 1: Generating narration...\n')

generateNarration(topic).then(narration => {
  if (!narration) {
    console.log('No narration returned')
    return
  }
  
  console.log('Generated narration:')
  console.log(narration)
  console.log('\nStep 2: Converting each scene to image prompt...\n')
  
  // Parse the JSON
  try {
    const parsed = JSON.parse(narration)
    const scenes = parsed.scenes || []
    
    Promise.all(scenes.map(async (scene, i) => {
      const prompt = await generateImagePrompt(scene.narration)
      console.log(`Scene ${scene.index}: "${scene.narration}"`)
      console.log(`  → Image prompt: ${prompt}\n`)
    }))
  } catch (e) {
    console.log('Failed to parse JSON, trying single scene...')
    generateImagePrompt(narration).then(prompt => {
      console.log(`Image prompt: ${prompt}`)
    })
  }
}).catch(err => console.error('Error:', err))
