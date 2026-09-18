// POST /api/assets/generate — generate images (9:16/16:9) and voice-overs for a topic's scenes
// Body: { topicId: number }
// Aspect ratio derives from Series.videoDuration (shorts → 9:16, long → 16:9)
import { NextRequest, NextResponse } from 'next/server'
import { generateAssetsForTopic } from '@/lib/assetGenerator'

// Allow longer route execution. A 10-scene topic can take 90-180s for image
// generation + audio synthesis. Without this, Next.js dev server aborts at ~60s
// and the browser sees a 502 even though the server is still processing.
export const maxDuration = 300 // 5 minutes per topic

export async function POST(request: NextRequest) {
  try {
    const { topicId } = await request.json()
    if (!topicId || typeof topicId !== 'number') {
      return NextResponse.json({ error: 'topicId required' }, { status: 400 })
    }
    const result = await generateAssetsForTopic(topicId)
    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    console.error('[assets/generate] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
