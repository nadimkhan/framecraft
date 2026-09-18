// GET /api/topics/series/[seriesId] — get saved topics for a series
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> }
) {
  try {
    const { seriesId } = await params

    const topics = await prisma.topic.findMany({
      where: { seriesId },
      orderBy: { id: 'desc' },
    })

    return NextResponse.json({ topics })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
