// POST /api/scenes/assets — generate images + audio for a topic's scenes
// Body: { topicId: number }
// Aspect ratio derived from Series.videoDuration: shorts = 9:16, long = 16:9
import { NextRequest, NextResponse } from 'next/server'
import { generateAssetsForTopic } from '@/lib/assetGenerator'

export async function POST(request: NextRequest) {
  try {
    const { topicId } = await request.json()
    if (!topicId || typeof topicId !== 'number') {
      return NextResponse.json({ error: 'topicId required' }, { status: 400 })
    }

    const result = await generateAssetsForTopic(topicId)
    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    console.error('[scenes/assets] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
