const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'nousresearch/hermes-4-405b'
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

interface OpenRouterMessage {
  role: 'system' | 'user'
  content: string
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string | null
      reasoning?: string
    }
  }>
}

export interface LongFormStorySceneData {
  title: string
  narration: string
  durationSeconds: number
  scenes: Array<{
    index: number
    narration: string
    prompt: string
  }>
}

const LONG_FORM_SYSTEM_PROMPT = `You are a professional storyteller and video script writer. Your task is to transform long-form stories into compelling video scripts with multiple scenes.

CRITICAL RULES FOR LONG-FORM VIDEOS:
- Total duration: 3-10 minutes (180-600 seconds)
- Scene count: 8-20 scenes depending on story length
- Each scene narration: 20-35 words for natural pacing
- Write like a REAL person telling a story - conversational, natural, like you're talking to a friend
- Avoid: robotic phrases, formal language, AI-sounding patterns
- Use: contractions, casual expressions, personal touches, varied sentence lengths
- Hook viewers in the first scene with something intriguing
- Build tension and emotion throughout
- End with a satisfying conclusion

Image prompts must describe VISUAL SCENES only:
- Format: [SUBJECT], [SETTING/ENVIRONMENT], [LIGHTING], [MOOD], [DETAILS]
- ALWAYS include: anime style, manga artwork, cel-shaded, anime key visual
- Quality tags: masterpiece, best quality, highly detailed, 8k, cinematic lighting
- Describe what you SEE, not what is being said

Output ONLY valid JSON:
{
  "title": "string - compelling video title",
  "narration": "string - full narration text",
  "durationSeconds": number (180-600),
  "scenes": [
    {"index": 1, "narration": "string (20-35 words)", "prompt": "string - visual description"}
  ]
}`

const IMAGE_STYLES: Record<string, { keywords: string; quality: string }> = {
  anime: {
    keywords: 'anime style, manga artwork, cel-shaded, anime key visual, Japanese anime',
    quality: 'masterpiece, best quality, highly detailed, 8k, cinematic lighting, vibrant colors'
  },
  realistic: {
    keywords: 'photorealistic, realistic, lifelike, natural lighting, detailed photography',
    quality: 'ultra realistic, 8k, photorealistic, detailed texture, professional photography'
  },
  mystical: {
    keywords: 'mystical, fantasy art, magical, ethereal, enchanted, otherworldly',
    quality: 'masterpiece, best quality, fantasy art, detailed, cinematic lighting, mystical atmosphere'
  },
  cyberpunk: {
    keywords: 'cyberpunk, futuristic, neon, sci-fi, dystopian, high tech',
    quality: 'cyberpunk art, neon lights, sci-fi, detailed, 8k, cinematic'
  },
  watercolor: {
    keywords: 'watercolor painting, watercolor art, soft colors, artistic, painterly',
    quality: 'watercolor, artistic, beautiful colors, detailed, gallery quality'
  },
  oil_painting: {
    keywords: 'oil painting, classical painting, fine art, Renaissance style, brush strokes',
    quality: 'oil painting, classical art, detailed, museum quality, artistic'
  },
  digital_art: {
    keywords: 'digital art, concept art, illustration, digital painting, modern art',
    quality: 'digital art, masterpiece, best quality, detailed illustration, vibrant'
  },
  '3d_render': {
    keywords: '3D render, CGI, 3D illustration, computer graphics, Blender',
    quality: '3D render, CGI, photorealistic, octane render, detailed, 8k'
  }
}

function getImageStyleKeywords(style: string): { keywords: string; quality: string } {
  return IMAGE_STYLES[style] || IMAGE_STYLES.anime
}

export async function generateScenesFromLongStory(storyContent: string, imageStyle: string = 'anime'): Promise<LongFormStorySceneData> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured')
  }

  const storyLength = storyContent.length
  let estimatedScenes = 8
  let estimatedDuration = 180

  if (storyLength > 2000) {
    estimatedScenes = 12
    estimatedDuration = 300
  }
  if (storyLength > 4000) {
    estimatedScenes = 16
    estimatedDuration = 420
  }
  if (storyLength > 6000) {
    estimatedScenes = 20
    estimatedDuration = 540
  }

  const styleInfo = getImageStyleKeywords(imageStyle)

  const userMessage: OpenRouterMessage = {
    role: 'user',
    content: `Transform this story into a long-form video script with ${estimatedScenes}-${estimatedScenes + 4} scenes.

STORY:
${storyContent}

Requirements:
- Create ${estimatedScenes}-${estimatedScenes + 4} scenes that flow naturally
- Each scene narration: 20-35 words - make it sound like a REAL person talking, not AI
- Use contractions (don't, can't, it's), casual language, varied rhythm
- Avoid: "In this scene", "We see", "The audience observes", robotic phrases
- Total duration: ${estimatedDuration}-${estimatedDuration + 60} seconds
- Hook viewers immediately in scene 1
- Build through the middle scenes
- End with impact in the final scene

IMAGE PROMPTS (CRITICAL):
- Describe what you SEE in each scene - character, setting, lighting, mood
- NEVER include narration text in the prompt
- Format: [SUBJECT], [SETTING], [LIGHTING], [MOOD], [DETAILS]
- ALWAYS include these style keywords: ${styleInfo.keywords}
- Add: ${styleInfo.quality}

Output ONLY valid JSON with the structure specified in the system prompt.`
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3001',
      'X-Title': 'YT Long Form Automation'
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: LONG_FORM_SYSTEM_PROMPT },
        userMessage
      ],
      temperature: 0.8,
      max_tokens: 8000
    })
  })

  if (response.status === 429) {
    throw new Error('Rate limit exceeded. Please try again in a few minutes.')
  }

  if (!response.ok) {
    const error = await response.text()
    console.error('OpenRouter API error:', error)
    throw new Error(`API error: ${response.status}`)
  }

  const data: OpenRouterResponse = await response.json()
  
  let content = data.choices[0]?.message?.content
  const reasoning = data.choices[0]?.message?.reasoning

  if (!content && reasoning) {
    content = reasoning
  }

  if (!content) {
    throw new Error('No content returned from AI. Please try again.')
  }

  let jsonStr = content.trim()
  
  // Remove markdown code blocks
  jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').replace(/`/g, '').trim()

  // Try multiple strategies to extract valid JSON
  let parsed = null
  let lastError = null
  
  // Strategy 1: Direct parse
  try {
    parsed = JSON.parse(jsonStr)
  } catch (e) {
    lastError = e
    console.log('Direct JSON parse failed:', e)
    
    // Strategy 2: Extract JSON object using regex
    const match = jsonStr.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        parsed = JSON.parse(match[0])
      } catch (e2) {
        lastError = e2
        console.log('Regex extract failed:', e2)
        
        // Strategy 3: Try to find and fix common issues
        // Fix unquoted values like [lonely figure -> "[lonely figure"
        let fixed = jsonStr
          .replace(/"\s*:\s*\[/g, '": "')  // Fix array start without quotes
          .replace(/\[\s*([^\]]+)\s*\]/g, '"$1"')  // Quote array-like values
        
        try {
          parsed = JSON.parse(fixed)
        } catch (e3) {
          lastError = e3
          console.log('Fixed JSON parse failed:', e3)
          
          // Strategy 4: Try to extract just the scenes array
          const scenesMatch = jsonStr.match(/"scenes"\s*:\s*\[([\s\S]*)\]/i)
          if (scenesMatch) {
            throw new Error('AI returned incomplete response - scenes array may be truncated. Please try again.')
          }
        }
      }
    }
  }

  if (!parsed) {
    throw new Error('Failed to parse AI response. Please try again.')
  }

  return validateLongFormData(parsed, storyLength, imageStyle)
}

function validateLongFormData(data: unknown, storyLength: number, imageStyle: string = 'anime'): LongFormStorySceneData {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid response format')
  }

  const obj = data as Record<string, unknown>

  if (typeof obj.title !== 'string') {
    throw new Error('Missing or invalid title')
  }
  
  if (!Array.isArray(obj.scenes) || obj.scenes.length < 4) {
    throw new Error('Scenes must be an array of at least 4 items')
  }

  const styleInfo = getImageStyleKeywords(imageStyle)

  const fixPrompt = (prompt: string): string => {
    let fixed = prompt.trim()
    
    fixed = fixed.replace(/^(anime|ANIME|realistic|mystical|cyberpunk|watercolor|oil_painting|digital|3d)[- ]?(style|character|woman|man|girl|boy)?[-: ]*/i, '')
    fixed = fixed.replace(/character[, ]*/i, '')
    fixed = fixed.replace(/but now they have/i, ', ')
    fixed = fixed.replace(/but now/i, ', ')
    fixed = fixed.replace(/\. The /g, ', ')
    
    if (fixed.length < 10) {
      fixed = prompt
    }
    
    const hasStyleKeyword = new RegExp(Object.keys(IMAGE_STYLES).join('|'), 'i').test(prompt)
    
    if (hasStyleKeyword) {
      return prompt + `, ${styleInfo.quality}`
    } else {
      return `${styleInfo.keywords}, ${fixed}, ${styleInfo.quality}`
    }
  }

  const scenes = obj.scenes.map((scene, index) => {
    const s = scene as Record<string, unknown>
    return {
      index: typeof s.index === 'number' ? s.index : index + 1,
      narration: String(s.narration || ''),
      prompt: fixPrompt(String(s.prompt || ''))
    }
  })

  const totalNarrationWords = scenes.reduce((sum, s) => sum + s.narration.split(' ').length, 0)
  const estimatedDuration = Math.max(180, Math.min(600, Math.round(totalNarrationWords * 0.4)))

  return {
    title: obj.title as string,
    narration: scenes.map(s => s.narration).join(' '),
    durationSeconds: estimatedDuration,
    scenes
  }
}

export async function generateLongFormWithCustomModel(
  storyContent: string, 
  model: string,
  imageStyle: string = 'anime'
): Promise<LongFormStorySceneData> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured')
  }

  const storyLength = storyContent.length
  let estimatedScenes = 10
  let estimatedDuration = 240

  if (storyLength > 3000) {
    estimatedScenes = 14
    estimatedDuration = 360
  }
  if (storyLength > 5000) {
    estimatedScenes = 18
    estimatedDuration = 480
  }

  const styleInfo = getImageStyleKeywords(imageStyle)

  const userMessage: OpenRouterMessage = {
    role: 'user',
    content: `Create a long-form video script from this story with ${estimatedScenes}-${estimatedScenes + 4} scenes.

STORY:
${storyContent}

Requirements:
- ${estimatedScenes}-${estimatedScenes + 4} scenes
- 20-35 words per scene narration - make it sound NATURAL, like a real person talking
- Use contractions, casual language, avoid robotic phrases
- ${estimatedDuration}-${estimatedDuration + 60} seconds total
- Engaging, conversational tone - not AI-sounding
- Hook first, build through middle, end with impact

IMAGE PROMPTS:
- Visual descriptions only: [SUBJECT], [SETTING], [LIGHTING], [MOOD]
- Include: ${styleInfo.keywords}
- Add: ${styleInfo.quality}

Output valid JSON only.`
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3001',
      'X-Title': 'YT Long Form Automation'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: LONG_FORM_SYSTEM_PROMPT },
        userMessage
      ],
      temperature: 0.8,
      max_tokens: 8000
    })
  })

  if (response.status === 429) {
    throw new Error('Rate limit exceeded. Please try again.')
  }

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API error: ${response.status}`)
  }

  const data: OpenRouterResponse = await response.json()
  
  let content = data.choices[0]?.message?.content
  const reasoning = data.choices[0]?.message?.reasoning

  if (!content && reasoning) {
    content = reasoning
  }

  if (!content) {
    throw new Error('No content returned from AI.')
  }

  let jsonStr = content.trim()
  jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').replace(/`/g, '').trim()

  let parsed = null
  let lastError = null
  
  // Strategy 1: Direct parse
  try {
    parsed = JSON.parse(jsonStr)
  } catch (e) {
    lastError = e
    console.log('Direct JSON parse failed:', e)
    
    // Strategy 2: Extract JSON object using regex
    const match = jsonStr.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        parsed = JSON.parse(match[0])
      } catch (e2) {
        lastError = e2
        console.log('Regex extract failed:', e2)
        
        // Strategy 3: Try to find and fix common issues
        let fixed = jsonStr
          .replace(/"\s*:\s*\[/g, '": "')
          .replace(/\[\s*([^\]]+)\s*\]/g, '"$1"')
        
        try {
          parsed = JSON.parse(fixed)
        } catch (e3) {
          lastError = e3
          console.log('Fixed JSON parse failed:', e3)
          
          const scenesMatch = jsonStr.match(/"scenes"\s*:\s*\[([\s\S]*)\]/i)
          if (scenesMatch) {
            throw new Error('AI returned incomplete response - scenes array may be truncated. Please try again.')
          }
        }
      }
    }
  }

  if (!parsed) {
    throw new Error('Failed to parse AI response.')
  }

  return validateLongFormData(parsed, storyLength, imageStyle)
}
