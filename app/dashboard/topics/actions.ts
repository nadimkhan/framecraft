'use server'

import prisma from '@/lib/db'
import { generateScenesFromLongStory } from '@/lib/longFormStory'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

function getAllScriptModels(): string[] {
  const models: string[] = []
  for (let i = 1; i <= 10; i++) {
    const model = process.env[`SCRIPT_MODEL_${i}`]
    if (model) {
      models.push(model)
    }
  }
  if (models.length === 0) {
    models.push('stepfun/step-3.5-flash:free')
  }
  return models
}

interface OpenRouterMessage {
  role: 'system' | 'user'
  content: string
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

const TOPIC_SYSTEM_PROMPT = `You are a viral YouTube Shorts topic strategist. Generate scroll-stopping, controversial topic titles.

Topics must:
- Use power words: secret, truth, hidden, shocking, never, stop, quit, etc.
- Create curiosity gaps
- Be specific and emotionally charged

Output ONLY a JSON array like ["topic1", "topic2"].`

function extractJSONArray(content: string): string[] | null {
  let jsonStr = content.trim()

  jsonStr = jsonStr.replace(/^```json\s*/g, '').replace(/^```/g, '').replace(/```$/g, '').trim()
  jsonStr = jsonStr.replace(/^```\s*/g, '').trim()

  const patterns = [
    /\[[\s\S]*\]/,
    /\{[\s\S]*topics[\s\S]*\}/i,
  ]

  for (const pattern of patterns) {
    const match = jsonStr.match(pattern)
    if (match) {
      jsonStr = match[0]
      break
    }
  }

  const lines = jsonStr.split('\n')
  const jsonLines: string[] = []
  let inArray = false
  for (const line of lines) {
    if (line.includes('[')) inArray = true
    if (inArray) jsonLines.push(line)
    if (line.includes(']')) break
  }
  if (jsonLines.length > 0) {
    jsonStr = jsonLines.join('\n')
  }

  jsonStr = jsonStr.replace(/^[\s\n]*[\[\{]/, '[').replace(/[\]\}]\s*$/, ']')

  try {
    const parsed = JSON.parse(jsonStr)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string')
    }
    if (typeof parsed === 'object' && parsed !== null) {
      const topics = parsed.topics || parsed.items || parsed.results || Object.values(parsed).find(Array.isArray)
      if (Array.isArray(topics)) {
        return topics.filter((item): item is string => typeof item === 'string')
      }
    }
  } catch {
    const arrayMatch = jsonStr.match(/\[[\s\S]*?\]/g)
    if (arrayMatch) {
      for (const match of arrayMatch) {
        try {
          const parsed = JSON.parse(match)
          if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(item => typeof item === 'string')) {
            return parsed
          }
        } catch {
          continue
        }
      }
    }
  }

  return null
}

const MAX_RETRIES = 5
const INITIAL_DELAY_MS = 5000
const MAX_DELAY_MS = 60000

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function generateAITopicsWithRetry(baseTopic: string, count: number, modelIndex: number = 0, attempt: number = 1): Promise<string[]> {
  if (!OPENROUTER_API_KEY) {
    return generateViralTopicsFallback(baseTopic, count)
  }

  const models = getAllScriptModels()
  if (models.length === 0) {
    return generateViralTopicsFallback(baseTopic, count)
  }
  
  // If we've tried all models, fallback to viral topics
  if (modelIndex >= models.length) {
    return generateViralTopicsFallback(baseTopic, count)
  }

  const userMessage: OpenRouterMessage = {
    role: 'user',
    content: `Generate ${count} viral YouTube Shorts topics about "${baseTopic}". Output ONLY valid JSON array.`
  }

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title': 'YT Shorts Automation'
      },
      body: JSON.stringify({
        model: models[modelIndex],
        messages: [
          { role: 'system', content: TOPIC_SYSTEM_PROMPT },
          userMessage
        ],
        temperature: 0.9,
        max_tokens: 1000
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`OpenRouter API error with model ${models[modelIndex]} (attempt ${attempt}):`, errorText)
      
      if (errorText.includes('rate-limited') || response.status === 429) {
        // For rate limits, try the same model again after delay (up to MAX_RETRIES times)
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS)
          console.log(`Rate limited. Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`)
          await sleep(delay)
          return generateAITopicsWithRetry(baseTopic, count, modelIndex, attempt + 1)
        } else {
          // If we've exhausted retries for this model, try the next model
          console.log(`Exhausted retries for model ${models[modelIndex]}. Trying next model...`)
          return generateAITopicsWithRetry(baseTopic, count, modelIndex + 1, 1)
        }
      } else {
        // For other errors, try the next model
        console.log(`Error with model ${models[modelIndex]}. Trying next model...`)
        return generateAITopicsWithRetry(baseTopic, count, modelIndex + 1, 1)
      }
    }

    const data: OpenRouterResponse = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      console.error(`No content from model ${models[modelIndex]}. Trying next model...`)
      return generateAITopicsWithRetry(baseTopic, count, modelIndex + 1, 1)
    }

    const topics = extractJSONArray(content)
    if (Array.isArray(topics) && topics.length > 0) {
      return topics
    }

    console.error(`Invalid topics from model ${models[modelIndex]}. Trying next model...`)
    return generateAITopicsWithRetry(baseTopic, count, modelIndex + 1, 1)
  } catch (error) {
    console.error(`Topic generation failed with model ${models[modelIndex]} (attempt ${attempt}):`, error)
    
    // For network or unexpected errors, try the next model
    console.log(`Error with model ${models[modelIndex]}. Trying next model...`)
    return generateAITopicsWithRetry(baseTopic, count, modelIndex + 1, 1)
  }
}

async function generateAITopics(baseTopic: string, count: number): Promise<string[]> {
  if (!OPENROUTER_API_KEY) {
    return generateViralTopicsFallback(baseTopic, count)
  }

  // Try all models in sequence until one works
  return generateAITopicsWithRetry(baseTopic, count, 0, 1)
}

function generateViralTopicsFallback(baseTopic: string, count: number): string[] {
  const powerWords = [
    'secret', 'truth', 'shocking', 'never', 'stop', 'start', 'quit',
    'hidden', 'mistake', 'lie', 'actually', 'really', 'why', 'how',
    'the real reason', 'what nobody tells you', 'finally'
  ]
  
  const formats = [
    `Stop ${baseTopic} (do this instead)`,
    `The truth about ${baseTopic} nobody wants to hear`,
    `Why you should ${baseTopic} immediately`,
    `What successful people know about ${baseTopic}`,
    `Stop doing ${baseTopic} - do this instead`,
    `The ${baseTopic} mistake killing your progress`,
    `Never ${baseTopic} until you read this`,
    `How to ${baseTopic} in 2024`,
    `Why ${baseTopic} is harder than you think`,
    `The hidden ${baseTopic} technique that works`,
    `Quit ${baseTopic} if you want success`,
    `${baseTopic} tips that changed everything for me`,
    `What happens when you ${baseTopic} every day`,
    `The psychology behind ${baseTopic}`,
    `${baseTopic} secrets that will shock you`,
    `Why most people fail at ${baseTopic}`,
    `How I mastered ${baseTopic} in 30 days`,
    `${baseTopic} habits that are destroying you`,
    `The exact moment you should ${baseTopic}`,
    `Everything you know about ${baseTopic} is wrong`
  ]

  const topics: string[] = []
  
  for (let i = 0; i < count; i++) {
    let topic = formats[i % formats.length]
    if (i >= formats.length) {
      const word = powerWords[i % powerWords.length]
      topic = `The ${word} ${baseTopic} strategy that works`
    }
    topics.push(topic)
  }
  
  return topics
}

const TOPICS_PER_REQUEST = 1
const DELAY_BETWEEN_REQUESTS_MS = 5000

export async function generateTopics(baseTopic: string, videosPerDay: number, days: number) {
  if (!baseTopic.trim()) {
    throw new Error('Base topic is required')
  }

  const existingTopics = await prisma.topic.findMany({
    select: { title: true },
  })
  const existingTitles = new Set(existingTopics.map(t => t.title.toLowerCase().trim()))

  const topicCount = videosPerDay * days
  
  const batch = await prisma.topicBatch.create({
    data: {
      baseTopic,
      days,
      topics: {
        create: [],
      },
    },
    include: {
      topics: true,
    },
  })

  let topicsGenerated = 0
  
  while (topicsGenerated < topicCount) {
    const remaining = topicCount - topicsGenerated
    const batchSize = Math.min(TOPICS_PER_REQUEST, remaining)
    
    console.log(`Generating topics ${topicsGenerated + 1}-${topicsGenerated + batchSize} of ${topicCount}...`)
    
    let newTopics = await generateAITopicsWithRetry(baseTopic, batchSize)
    
    const uniqueNewTopics = newTopics.filter(title => !existingTitles.has(title.toLowerCase().trim()))
    
    for (const title of uniqueNewTopics) {
      existingTitles.add(title.toLowerCase().trim())
    }
    
    if (uniqueNewTopics.length > 0) {
      await prisma.topic.createMany({
        data: uniqueNewTopics.map((title: string) => ({
          title,
          selected: false,
          batchId: batch.id,
        })),
      })
      
      topicsGenerated += uniqueNewTopics.length
    } 
    
    if (uniqueNewTopics.length < batchSize) {
      console.warn(`Some topics were duplicates, generating more...`)
      const fallbackTopics = generateViralTopicsFallback(baseTopic, batchSize - uniqueNewTopics.length)
      const uniqueFallbacks = fallbackTopics.filter(title => !existingTitles.has(title.toLowerCase().trim()))
      
      for (const title of uniqueFallbacks) {
        existingTitles.add(title.toLowerCase().trim())
      }
      
      if (uniqueFallbacks.length > 0) {
        await prisma.topic.createMany({
          data: uniqueFallbacks.map((title: string) => ({
            title,
            selected: false,
            batchId: batch.id,
          })),
        })
        topicsGenerated += uniqueFallbacks.length
      }
    }

    if (topicsGenerated < topicCount) {
      console.log(`Waiting ${DELAY_BETWEEN_REQUESTS_MS / 1000}s before next request...`)
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS))
    }
  }

  const finalBatch = await prisma.topicBatch.findUnique({
    where: { id: batch.id },
    include: {
      topics: true,
    },
  })

  return finalBatch
}

export async function getTopicBatches() {
  const batches = await prisma.topicBatch.findMany({
    include: {
      topics: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  })
  return batches
}

export async function getLatestBatch() {
  const batch = await prisma.topicBatch.findFirst({
    include: {
      topics: {
        where: {
          reviewCompleted: false,
          isExistingVideo: false,
        },
        include: {
          video: {
            select: {
              id: true,
              generationStatus: true,
              uploadStatus: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })
  return batch
}

export async function getStoriesNotInBatch() {
  const videos = await prisma.video.findMany({
    where: {
      batchId: null,
      scenes: {
        some: {},
      },
    },
    include: {
      scenes: {
        orderBy: { index: 'asc' },
      },
      topic: true,
    },
    orderBy: {
      id: 'desc',
    },
  })
  
  return videos.map(v => ({
    ...v.topic,
    video: v,
  }))
}

export async function toggleTopicSelection(topicId: number, selected: boolean) {
  const topic = await prisma.topic.update({
    where: { id: topicId },
    data: { selected },
  })
  return topic
}

export async function bulkToggleSelection(topicIds: number[], selected: boolean) {
  await prisma.topic.updateMany({
    where: {
      id: { in: topicIds },
    },
    data: { selected },
  })
}

export async function selectAllInBatch(batchId: number, selected: boolean) {
  await prisma.topic.updateMany({
    where: { batchId },
    data: { selected },
  })
}

export async function deleteTopic(topicId: number) {
  const videos = await prisma.video.findMany({
    where: { topicId },
    select: { id: true },
  })
  const videoIds = videos.map(v => v.id)
  
  if (videoIds.length > 0) {
    await prisma.scene.deleteMany({
      where: { videoId: { in: videoIds } },
    })
  }
  
  await prisma.video.deleteMany({
    where: { topicId },
  })
  
  await prisma.topic.delete({
    where: { id: topicId },
  })
}

export async function deleteSelectedTopics(topicIds: number[]) {
  const videos = await prisma.video.findMany({
    where: { topicId: { in: topicIds } },
    select: { id: true },
  })
  const videoIds = videos.map(v => v.id)
  
  if (videoIds.length > 0) {
    await prisma.scene.deleteMany({
      where: { videoId: { in: videoIds } },
    })
  }
  
  await prisma.video.deleteMany({
    where: { topicId: { in: topicIds } },
  })
  
  await prisma.topic.deleteMany({
    where: {
      id: { in: topicIds },
    },
  })
}

export async function deleteBatch(batchId: number) {
  await prisma.topicBatch.delete({
    where: { id: batchId },
  })
}

export interface GeneratedStoryScenes {
  id: number
  title: string
  narration: string
  durationSeconds: number
  scenes: Array<{
    id: number
    index: number
    narration: string
    prompt: string
  }>
}

export async function generateFromStory(storyContent: string, imageStyle: string = 'anime'): Promise<GeneratedStoryScenes> {
  if (!storyContent.trim()) {
    throw new Error('Story content is required')
  }

  if (storyContent.trim().length < 100) {
    throw new Error('Story must be at least 100 characters')
  }

  const scriptData = await generateScenesFromLongStory(storyContent, imageStyle)

  const batch = await prisma.topicBatch.create({
    data: {
      baseTopic: `Story: ${scriptData.title.substring(0, 50)}`,
      days: 1,
      topics: {
        create: {
          title: scriptData.title,
          selected: true,
        },
      },
    },
    include: {
      topics: {
        include: {
          video: {
            include: {
              scenes: true,
            },
          },
        },
      },
    },
  })

  const topic = batch.topics[0]

  const video = await prisma.video.create({
    data: {
      topicId: topic.id,
      title: scriptData.title,
      narration: scriptData.narration,
      durationSeconds: scriptData.durationSeconds,
      generationStatus: 'generating',
      scenes: {
        create: scriptData.scenes.map((scene: { index: number; narration: string; prompt: string }) => ({
          index: scene.index,
          narration: scene.narration,
          prompt: scene.prompt,
        })),
      },
    },
    include: {
      scenes: {
        orderBy: {
          index: 'asc',
        },
      },
    },
  })

  return {
    id: video.id,
    title: video.title,
    narration: video.narration,
    durationSeconds: video.durationSeconds,
    scenes: video.scenes.map((s) => ({
      id: s.id,
      index: s.index,
      narration: s.narration,
      prompt: s.prompt,
    })),
  }
}
