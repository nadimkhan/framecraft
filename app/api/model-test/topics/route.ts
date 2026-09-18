import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const topics = await prisma.topic.findMany({
      where: {
        video: {
          narration: '',
        },
      },
      select: {
        id: true,
        title: true,
      },
      orderBy: {
        id: 'desc',
      },
      take: 20,
    })

    return NextResponse.json(topics)
  } catch (error) {
    console.error('Error fetching topics:', error)
    return NextResponse.json({ error: 'Failed to fetch topics' }, { status: 500 })
  }
}
