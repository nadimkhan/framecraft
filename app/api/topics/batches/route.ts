// GET /api/topics/batches — list existing TopicBatches for the current series
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const seriesId = searchParams.get('seriesId')

    const where = seriesId ? { topics: { some: { seriesId } } } : {}

    const batches = await prisma.topicBatch.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 50,
      include: {
        _count: { select: { topics: true } },
      },
    })

    return NextResponse.json({
      batches: batches.map(b => ({
        id: b.id,
        name: b.baseTopic,
        topicCount: b._count.topics,
        createdAt: b.createdAt,
      })),
    })
  } catch (error: any) {
    console.error('List batches error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
