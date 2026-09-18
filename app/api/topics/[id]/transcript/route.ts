// PATCH /api/topics/[id]/transcript — update a saved topic's transcript
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const topicId = parseInt(id, 10)
    if (!Number.isFinite(topicId)) {
      return NextResponse.json({ error: 'Invalid topic id' }, { status: 400 })
    }

    const body = await request.json()
    const data: any = {}

    if (typeof body.sourceTranscript === 'string') {
      data.sourceTranscript = body.sourceTranscript
    }
    if (typeof body.fullStory === 'string') {
      data.fullStory = body.fullStory
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const updated = await prisma.topic.update({
      where: { id: topicId },
      data,
    })

    return NextResponse.json({
      ok: true,
      topicId: updated.id,
      sourceTranscript: updated.sourceTranscript,
      fullStory: updated.fullStory,
    })
  } catch (error: any) {
    console.error('Update topic transcript error:', error)
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
