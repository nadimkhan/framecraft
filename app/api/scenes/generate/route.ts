// POST /api/scenes/generate — split a topic's story into Scenes via LLM
// Scene count + style are derived from the topic's Series settings.
// Body: { topicId: number, force?: boolean }
//   - force=true: delete existing scenes and regenerate from scratch
//   - force=false (default): return cached scenes if they exist (idempotent)
//
// Allow long execution: regenerating 10+ scenes via LLM can take 60-180s.
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { generateScenesForTopic } from '@/lib/sceneGenerator'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { topicId, force } = body
    if (!topicId || typeof topicId !== 'number') {
      return NextResponse.json({ error: 'topicId required' }, { status: 400 })
    }

    const result = await generateScenesForTopic(topicId, { force: !!force })
    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    console.error('[scenes/generate] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
