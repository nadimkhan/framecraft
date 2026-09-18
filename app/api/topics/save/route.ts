// POST /api/topics/save — save topics to DB
// Accepts: { topics, seriesId, batchId? } — if batchId given, append to existing batch
//   if batchName given, create new batch with that name; else auto-name from first topic
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

interface SaveTopic {
  title: string
  fullStory?: string
  sourceType: 'ai' | 'youtube'
  sourceUrl?: string
  sourceViews?: number
  sourceDuration?: number
  sourceTranscript?: string
}

export async function POST(request: NextRequest) {
  try {
    const { topics, seriesId, batchId, batchName } = await request.json()

    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return NextResponse.json({ error: 'topics array required' }, { status: 400 })
    }

    if (!seriesId) {
      return NextResponse.json({ error: 'seriesId required' }, { status: 400 })
    }

    let batch
    if (batchId) {
      // Append to existing batch
      batch = await prisma.topicBatch.findUnique({ where: { id: batchId } })
      if (!batch) {
        return NextResponse.json({ error: `Batch ${batchId} not found` }, { status: 404 })
      }
    } else {
      // Create new batch
      const name = (batchName && batchName.trim()) || topics[0].title.slice(0, 100)
      batch = await prisma.topicBatch.create({
        data: {
          baseTopic: name,
          days: Math.ceil(topics.length / 2),
        },
      })
    }

    const created = await Promise.all(
      topics.map((topic: SaveTopic) =>
        prisma.topic.create({
          data: {
            batchId: batch.id,
            seriesId,
            title: topic.title,
            fullStory: topic.fullStory || null,
            sourceType: topic.sourceType,
            sourceUrl: topic.sourceUrl || null,
            sourceViews: topic.sourceViews || null,
            sourceDuration: topic.sourceDuration || null,
            sourceTranscript: topic.sourceTranscript || null,
            selected: false,
            reviewCompleted: false,
            isExistingVideo: false,
          },
        })
      )
    )

    return NextResponse.json({
      saved: created.length,
      batchId: batch.id,
      batchName: batch.baseTopic,
      topics: created.map(t => ({ id: t.id, title: t.title })),
    }, { status: 201 })
  } catch (error: any) {
    console.error('Save topics error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
