// OpenRouter AI integration for script and scene generation

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'nousresearch/hermes-4-405b'
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

function getAllMetadataModels(): string[] {
  const models: string[] = []
  for (let i = 1; i <= 10; i++) {
    const model = process.env[`SCRIPT_MODEL_${i}`]
    if (model) {
      models.push(model)
    }
  }
  if (models.length === 0) {
    models.push(OPENROUTER_MODEL)
  }
  return models
}

const STORY_TO_SCENES_SYSTEM_PROMPT = 'You are a story-to-scenes converter. Break down stories into video scenes.'

export function getModel() {
  return OPENROUTER_MODEL
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RateLimitError'
  }
}

export class APIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'APIError'
  }
}

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

interface ScriptSceneData {
  title: string
  narration: string
  durationSeconds: number
  scenes: Array<{
    index: number
    narration: string
    prompt: string
  }>
}

const SYSTEM_PROMPT = `You are a YouTube Shorts script writer. Generate engaging, human-sounding scripts for YouTube Shorts (under 60 seconds).

CRITICAL RULES:
- Total duration: 45-55 seconds MAX (for Shorts algorithm)
- Scene count: 5-6 scenes
- EACH scene narration: 10-15 words - make it sound natural and conversational
- Write like a real person speaking, not a robot
- Hook viewers in first 2 seconds
- End with call-to-action

Image prompts: ANIME-CONCEPT ART style - anime-inspired with detailed backgrounds, professional illustration quality like anime key visuals

Output ONLY valid JSON:
{
  "title": "string",
  "narration": "string", 
  "durationSeconds": number (45-55),
  "scenes": [
    {"index": 1, "narration": "string (10-15 words, natural and human-sounding)", "prompt": "string"}
  ]
}`

export async function generateScriptWithOpenRouter(topicTitle: string): Promise<ScriptSceneData> {
  if (!OPENROUTER_API_KEY) {
    throw new APIError('OpenRouter API key not configured')
  }

  const userMessage: OpenRouterMessage = {
    role: 'user',
    content: `Generate a viral YouTube Shorts script for: "${topicTitle}"

Requirements:
- Total duration: 45-55 seconds MAX
- Scene count: 6-8 scenes (can be 6, 7, or 8)  
- EACH scene narration: 10-15 words - make it sound natural and conversational like a real person
- Write engaging, human-sounding content
- Hook viewers immediately
- End with call-to-action

IMAGE PROMPTS (CRITICAL - must be in image generation prompt format):
- IMAGE PROMPTS MUST ONLY describe VISUAL SCENES - character, setting, lighting, mood, details
- NEVER include the narration text in the image prompt
- NEVER include questions or narrative statements - only visual descriptions
- Format: [SUBJECT], [SETTING/ENVIRONMENT], [LIGHTING], [MOOD], [DETAILS]
- ALWAYS include these anime style keywords: anime style, manga artwork, cel-shaded, anime key visual
- Quality tags: masterpiece, best quality, highly detailed, 8k, cinematic lighting, vibrant colors
- GOOD prompt example: "Beautiful anime girl with long flowing hair, sitting in a cherry blossom garden, soft golden sunset lighting, peaceful mood, cel-shaded, anime style, masterpiece, best quality"
- BAD prompt examples:
  - "Anime character, Try it for a week and let me know" (includes narration - WRONG)
  - "Anime Woman character, but now they have a gentle, warm smile" (narrative style - WRONG)
- For each scene: describe exactly what you SEE (character appearance, pose, expression, clothing, background), NOT what is being said
- Output ONLY valid JSON
- The title should be compelling and click-worthy`
  }

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
        { role: 'system', content: SYSTEM_PROMPT },
        userMessage
      ],
      temperature: 0.8,
      max_tokens: 4000,
      reasoning: { enabled: false }
    })
  })

  if (response.status === 429) {
    throw new RateLimitError('Rate limit exceeded. Please try again in a few minutes.')
  }

  if (!response.ok) {
    const error = await response.text()
    console.error('OpenRouter API error:', error)
    throw new APIError(`API error: ${response.status}`)
  }

  const data: OpenRouterResponse = await response.json()
  
  console.log('[Script Debug] Full API response:', JSON.stringify(data, null, 2))
  
  let content = data.choices[0]?.message?.content
  const reasoning = data.choices[0]?.message?.reasoning

  // Handle reasoning models (like StepFun) that put output in reasoning field
  if (!content && reasoning) {
    console.log('[StepFun Debug] Content is null but reasoning exists, extracting from reasoning')
    content = reasoning
  }

  if (!content) {
    console.error('[StepFun Debug] No content in response. Full response:', data)
    throw new APIError('No content returned from AI. Please try again.')
  }

  console.log('[StepFun Debug] Raw content from AI:')
  console.log('---START---')
  console.log(content)
  console.log('---END---')
  console.log('[StepFun Debug] Content length:', content.length)
  console.log('[StepFun Debug] First 200 chars:', content.substring(0, 200))
  console.log('[StepFun Debug] Last 200 chars:', content.substring(content.length - 200))

  let jsonStr = content.trim()
  jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim()

  console.log('[StepFun Debug] Cleaned JSON string to parse:')
  console.log('---START---')
  console.log(jsonStr)
  console.log('---END---')

  try {
    const parsed = JSON.parse(jsonStr)
    console.log('[StepFun Debug] JSON parse successful')
    return validateStoryScenesData(parsed)
  } catch (e) {
    console.log('[StepFun Debug] First JSON parse failed:', e)
    const match = jsonStr.match(/\{[\s\S]*\}/)
    if (match) {
      console.log('[StepFun Debug] Trying regex extraction, matched:', match[0].substring(0, 100))
      try {
        const parsed = JSON.parse(match[0])
        console.log('[StepFun Debug] Regex extraction parse successful')
        return validateStoryScenesData(parsed)
      } catch (e2) {
        console.error('[StepFun Debug] Regex parse also failed:', e2)
        throw new APIError('Failed to parse AI response. Please try again.')
      }
    }
    console.error('[StepFun Debug] No JSON object found in response')
  }

  throw new APIError('Invalid response format from AI. Please try again.')
}

function validateStoryScenesData(data: unknown): ScriptSceneData {
  console.log('[StoryValidation Debug] Validating data:', JSON.stringify(data, null, 2).substring(0, 500))
  
  if (typeof data !== 'object' || data === null) {
    console.error('[StoryValidation Debug] Data is not an object:', typeof data)
    throw new Error('Invalid response format')
  }

  const obj = data as Record<string, unknown>
  
  console.log('[StoryValidation Debug] Data keys:', Object.keys(obj))
  console.log('[StoryValidation Debug] Title type:', typeof obj.title, 'value:', obj.title)
  console.log('[StoryValidation Debug] Scenes type:', typeof obj.scenes, 'isArray:', Array.isArray(obj.scenes))

  if (typeof obj.title !== 'string') {
    console.error('[StoryValidation Debug] Invalid title:', obj.title)
    throw new Error('Missing or invalid title')
  }
  
  if (!Array.isArray(obj.scenes) || obj.scenes.length < 4) {
    console.error('[StoryValidation Debug] Invalid scenes:', obj.scenes)
    throw new Error('Scenes must be an array of at least 4 items')
  }

  const scenes = obj.scenes.map((scene, index) => {
    const s = scene as Record<string, unknown>
    return {
      index: typeof s.index === 'number' ? s.index : index + 1,
      narration: String(s.narration || ''),
      prompt: String(s.prompt || '')
    }
  })

  const totalNarrationWords = scenes.reduce((sum, s) => sum + s.narration.split(' ').length, 0)
  const estimatedDuration = Math.round(totalNarrationWords * 0.4)

  return {
    title: obj.title,
    narration: scenes.map(s => s.narration).join(' '),
    durationSeconds: estimatedDuration,
    scenes
  }
}

function validateScriptData(data: unknown): ScriptSceneData {
  console.log('[Validation Debug] Validating data:', JSON.stringify(data, null, 2).substring(0, 500))
  
  if (typeof data !== 'object' || data === null) {
    console.error('[Validation Debug] Data is not an object:', typeof data)
    throw new Error('Invalid response format')
  }

  const obj = data as Record<string, unknown>
  
  console.log('[Validation Debug] Data keys:', Object.keys(obj))
  console.log('[Validation Debug] Title type:', typeof obj.title)
  console.log('[Validation Debug] Narration type:', typeof obj.narration)
  console.log('[Validation Debug] Scenes type:', typeof obj.scenes, 'isArray:', Array.isArray(obj.scenes))
  if (Array.isArray(obj.scenes)) {
    console.log('[Validation Debug] Scenes length:', obj.scenes.length)
  }

  if (typeof obj.title !== 'string') {
    console.error('[Validation Debug] Invalid title:', obj.title)
    throw new Error('Missing or invalid title')
  }
  if (typeof obj.narration !== 'string') {
    console.error('[Validation Debug] Invalid narration:', obj.narration)
    throw new Error('Missing or invalid narration')
  }
  
  const durationSeconds = typeof obj.durationSeconds === 'number' 
    ? Math.max(30, Math.min(60, obj.durationSeconds))
    : 45

  if (!Array.isArray(obj.scenes) || obj.scenes.length < 4) {
    console.error('[Validation Debug] Invalid scenes:', obj.scenes)
    throw new Error('Scenes must be an array of at least 4 items')
  }

  const fixPrompt = (prompt: string): string => {
    // Transform narrative descriptions into proper image generation prompts
    let fixed = prompt.trim()
    
    // Remove common narrative phrases and restructure
    fixed = fixed.replace(/^(anime|ANIME)[- ]?(style|character|woman|man|girl|boy)?[-: ]*/i, '')
    fixed = fixed.replace(/character[, ]*/i, '')
    fixed = fixed.replace(/but now they have/i, ', ')
    fixed = fixed.replace(/but now/i, ', ')
    fixed = fixed.replace(/\. The /g, ', ')
    
    // If prompt is too short or empty, add default anime style
    if (fixed.length < 10) {
      fixed = prompt
    }
    
    // Build proper anime prompt with style keywords
    const styleKeywords = 'anime style, manga artwork, cel-shaded, anime key visual, detailed anime illustration'
    const qualityTags = 'masterpiece, best quality, highly detailed, 8k, cinematic lighting, vibrant colors'
    
    // Check if it already has anime keywords
    const hasAnimeKeyword = /anime|manga|japanese|cel-shaded|anime-style/i.test(prompt)
    
    if (hasAnimeKeyword) {
      // Already has anime keywords, just ensure proper formatting
      return prompt.replace(/anime-style/gi, 'anime style, manga artwork, cel-shaded') + `, ${qualityTags}`
    } else {
      // Add anime style keywords
      return `${styleKeywords}, ${fixed}, ${qualityTags}`
    }
  }

  const scenes = obj.scenes.map((scene, index) => {
    const s = scene as Record<string, unknown>
    const rawPrompt = String(s.prompt || '')
    return {
      index: typeof s.index === 'number' ? s.index : index + 1,
      narration: String(s.narration || ''),
      prompt: fixPrompt(rawPrompt)
    }
  })

  return {
    title: obj.title,
    narration: obj.narration,
    durationSeconds,
    scenes
  }
}

const DESCRIPTION_SYSTEM_PROMPT = `You are a social media content creator. Your task is to write natural, human-sounding descriptions for YouTube Shorts and Instagram Reels.

CRITICAL RULES:
- Write like a REAL person, NOT an AI generator
- Use casual, conversational tone
- Include hashtags naturally (not overdone)
- Add emojis sparingly and meaningfully
- Mention key points from the narration naturally
- Include a subtle call-to-action if appropriate
- Keep it engaging but not salesy
- DO NOT use formal or robotic language
- Make it sound like someone actually typed this themselves
- Include relevant keywords for discoverability`

export async function generateVideoDescription(
  narration: string,
  videoTitle: string
): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new APIError('OpenRouter API key not configured')
  }

  // Truncate narration if too long to avoid API issues
  const truncatedNarration = narration.length > 2000 
    ? narration.substring(0, 2000) + '...'
    : narration

  const userMessage: OpenRouterMessage = {
    role: 'user',
    content: `Create a YouTube/Instagram description for this video.

Video Title: "${videoTitle}"

Full Narration: "${truncatedNarration}"

Requirements:
- Write in a natural, conversational tone like a real person
- Make it engaging but not overproduced
- Include 5-8 relevant hashtags at the end
- Add 2-3 emojis if appropriate
- Keep it concise but informative (150-300 characters)
- Sound like YOU wrote it, not an AI
- Include a subtle CTA if it fits naturally
- Make it perfect for both YouTube and Instagram Reels`
  }

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
        { role: 'system', content: DESCRIPTION_SYSTEM_PROMPT },
        userMessage
      ],
      temperature: 0.9,
      max_tokens: 1000
    })
  })

  if (response.status === 429) {
    throw new RateLimitError('Rate limit exceeded. Please try again in a few minutes.')
  }

  if (!response.ok) {
    const error = await response.text()
    console.error('OpenRouter API error:', response.status, error)
    throw new APIError(`API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  console.log('OpenRouter response:', JSON.stringify(data).substring(0, 500))
  
  const content = data.choices?.[0]?.message?.content ?? data.content ?? null

  if (!content) {
    console.error('Empty content in response:', data)
    throw new APIError('No content returned from AI. Please try again.')
  }

  return content.trim()
}

export async function generateScriptWithCustomModel(topicTitle: string, model: string): Promise<ScriptSceneData> {
  if (!OPENROUTER_API_KEY) {
    throw new APIError('OpenRouter API key not configured')
  }

  console.log(`Generating script with model: ${model}`)

  const userMessage: OpenRouterMessage = {
    role: 'user',
    content: `Generate a viral YouTube Shorts script for: "${topicTitle}"

Requirements:
- Total duration: 45-55 seconds MAX
- Scene count: 6-8 scenes (can be 6, 7, or 8)  
- EACH scene narration: 10-15 words - make it sound natural and conversational like a real person
- Write engaging, human-sounding content
- Hook viewers immediately
- End with call-to-action

IMAGE PROMPTS (CRITICAL - must be in image generation prompt format):
- Format: [SUBJECT], [SETTING/ENVIRONMENT], [LIGHTING], [MOOD], [DETAILS]
- ALWAYS include these anime style keywords: anime style, manga artwork, cel-shaded, anime key visual
- Quality tags: masterpiece, best quality, highly detailed, 8k, cinematic lighting, vibrant colors
- GOOD prompt example: "Beautiful anime girl with long flowing hair, sitting in a cherry blossom garden, soft golden sunset lighting, peaceful mood, cel-shaded, anime style, masterpiece, best quality"
- BAD prompt example: "Anime Woman character, but now they have a gentle, warm smile" (this is narrative style, not prompt style)
- For each scene: describe what you SEE, not what happens
- Output ONLY valid JSON`
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3001',
      'X-Title': 'YT Shorts Automation'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        userMessage
      ],
      temperature: 0.8,
      max_tokens: 4000,
      reasoning: { enabled: false }
    })
  })

  if (response.status === 429) {
    throw new RateLimitError('Rate limit exceeded. Please try again in a few minutes.')
  }

  if (!response.ok) {
    const error = await response.text()
    console.error('OpenRouter API error:', error)
    throw new APIError(`API error: ${response.status}`)
  }

  const data: OpenRouterResponse = await response.json()
  
  console.log('[CustomModel Debug] Full API response:', JSON.stringify(data, null, 2))
  
  let content = data.choices[0]?.message?.content
  const reasoning = data.choices[0]?.message?.reasoning

  // Handle reasoning models (like StepFun) that put output in reasoning field
  if (!content && reasoning) {
    console.log('[CustomModel Debug] Content is null but reasoning exists, extracting from reasoning')
    content = reasoning
  }

  if (!content) {
    console.error('[CustomModel Debug] Empty content in response:', data)
    throw new APIError('No content returned from AI. Please try again.')
  }

  console.log('[CustomModel Debug] Raw AI response:')
  console.log('---START---')
  console.log(content)
  console.log('---END---')
  console.log('[CustomModel Debug] Content length:', content.length)

  let jsonStr = content.trim()
  jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/^```\n?/g, '').replace(/```$/g, '').trim()
  
  console.log('[CustomModel Debug] Cleaned JSON string to parse:')
  console.log('---START---')
  console.log(jsonStr)
  console.log('---END---')

  try {
    const parsed = JSON.parse(jsonStr)
    console.log('[CustomModel Debug] JSON parse successful')
    return validateScriptData(parsed)
  } catch (e) {
    console.log('[CustomModel Debug] First parse failed:', e)
    console.log('[CustomModel Debug] Trying regex extraction...')
    const match = jsonStr.match(/\{[\s\S]*\}/)
    if (match) {
      console.log('[CustomModel Debug] Regex matched:', match[0].substring(0, 100))
      try {
        const parsed = JSON.parse(match[0])
        console.log('[CustomModel Debug] Regex parse successful')
        return validateScriptData(parsed)
      } catch (e2) {
        console.error('[CustomModel Debug] Regex parse also failed:', e2)
        throw new APIError('Failed to parse AI response. Please try again.')
      }
    }
    
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      console.log('[CustomModel Debug] Array regex matched')
      try {
        const parsed = JSON.parse(arrayMatch[0])
        if (Array.isArray(parsed)) {
          console.log('[CustomModel Debug] Array parse successful')
          return validateScriptData({ title: topicTitle, scenes: parsed })
        }
      } catch (e3) {
        console.error('[CustomModel Debug] Array parse also failed:', e3)
      }
    }
    console.error('[CustomModel Debug] No valid JSON found in response')
  }

  throw new APIError('Invalid response format from AI. Please try again.')
}

export interface StorySceneData {
  title: string
  narration: string
  durationSeconds: number
  scenes: Array<{
    index: number
    narration: string
    prompt: string
  }>
}

export async function generateScenesFromStory(storyContent: string): Promise<StorySceneData> {
  throw new APIError('generateScenesFromStory is not implemented yet')
}

interface YouTubeMetadata {
  description: string
  tags: string[]
}

const YOUTUBE_METADATA_SYSTEM_PROMPT = `You are a YouTube content creator who writes natural, engaging video descriptions and tags.

CRITICAL RULES:
- Write like a REAL person sharing content they care about - NOT like a bot or AI
- Use casual, conversational language with contractions (don't, can't, here's)
- Include personality - like you're talking to a friend
- Start with a hook or relatable opening sentence
- Mention what the video is about naturally within the text
- Add 5-8 relevant hashtags at the end (mix of popular and niche)
- Use 2-4 emojis sprinkled naturally (not overdone)
- Include a soft call-to-action like "Drop a comment" or "Let me know what you think"
- Sound authentic and relatable, not corporate or salesy
- Write 150-250 characters for the description
- Tags should be relevant keywords (no # in tags, just the words)
- DO NOT sound robotic or use generic phrases like "In this video, we will..."
- DO NOT use formal language or bullet points
- Make it feel spontaneous and genuine`

export async function generateYouTubeMetadataFromTitle(
  videoTitle: string
): Promise<YouTubeMetadata> {
  if (!OPENROUTER_API_KEY) {
    throw new APIError('OpenRouter API key not configured')
  }

  const models = getAllMetadataModels()
  let lastError: Error | null = null

  for (const model of models) {
    try {
      const result = await generateMetadataWithModel(videoTitle, model)
      return result
    } catch (err) {
      console.error(`Model ${model} failed for metadata:`, err instanceof Error ? err.message : String(err))
      lastError = err as Error
    }
  }

  throw lastError || new Error('All models failed')
}

async function generateMetadataWithModel(
  videoTitle: string,
  model: string
): Promise<YouTubeMetadata> {
  const userMessage: OpenRouterMessage = {
    role: 'user',
    content: `Create a YouTube description and tags for this video title: "${videoTitle}"

Write this like a real person posting their own content - someone authentic and relatable who just wants to share something cool.

Requirements:
- Start with something casual and engaging
- Mention the topic naturally (don't force it)
- Use conversational tone with contractions
- Include 5-8 relevant hashtags at the end (with #)
- Add 2-4 emojis where they fit naturally
- Include a soft, friendly CTA
- Keep it 150-250 characters
- Sound HUMAN - like YOU wrote it, not a bot
- Avoid formal or robotic language
- NO phrases like "In this video" or "Today we explore"

Also provide 8-12 tags as a comma-separated list (these are for YouTube's tag field, NOT hashtags).

Output ONLY valid JSON:
{
  "description": "string with description and hashtags",
  "tags": ["tag1", "tag2", "tag3", ...]
}`
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3001',
      'X-Title': 'YT Shorts Automation'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: YOUTUBE_METADATA_SYSTEM_PROMPT },
        userMessage
      ],
      temperature: 0.9,
      max_tokens: 1000
    })
  })

  if (response.status === 429) {
    throw new RateLimitError('Rate limit exceeded. Please try again in a few minutes.')
  }

  if (!response.ok) {
    const error = await response.text()
    console.error('OpenRouter API error:', response.status, error)
    throw new APIError(`API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  console.log('OpenRouter metadata response:', JSON.stringify(data).substring(0, 500))
  
  const content = data.choices?.[0]?.message?.content ?? data.content ?? null

  if (!content) {
    console.error('Empty content in response:', data)
    throw new APIError('No content returned from AI. Please try again.')
  }

  let jsonStr = content.trim()
  jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim()

  try {
    const parsed = JSON.parse(jsonStr)
    return {
      description: parsed.description || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : []
    }
  } catch (e) {
    console.log('JSON parse failed, trying regex extraction...')
    const match = jsonStr.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        return {
          description: parsed.description || '',
          tags: Array.isArray(parsed.tags) ? parsed.tags : []
        }
      } catch (e2) {
        console.error('Regex parse also failed:', e2)
      }
    }
    throw new APIError('Failed to parse AI response. Please try again.')
  }
}
