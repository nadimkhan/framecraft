import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateScriptWithCustomModel } from '@/lib/ai'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { topicId, model } = body

    if (!topicId || !model) {
      return NextResponse.json(
        { error: 'topicId and model are required' },
        { status: 400 }
      )
    }

    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
    })

    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found' },
        { status: 404 }
      )
    }

    const scriptData = await generateScriptWithCustomModel(topic.title, model)

    return NextResponse.json({
      title: scriptData.title,
      narration: scriptData.narration,
      durationSeconds: scriptData.durationSeconds,
      scenes: scriptData.scenes,
    })
  } catch (error) {
    console.error('Error generating script:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate script' },
      { status: 500 }
    )
  }
}
