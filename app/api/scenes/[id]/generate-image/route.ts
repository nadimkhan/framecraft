// POST /api/scenes/[id]/generate-image — generate image for a single scene
import { NextRequest, NextResponse } from 'next/server'
import { generateImageForScene } from '@/lib/assetGenerator'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sceneId = parseInt(id, 10)
    if (!Number.isFinite(sceneId)) {
      return NextResponse.json({ error: 'Invalid scene id' }, { status: 400 })
    }
    const result = await generateImageForScene(sceneId)
    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    console.error('[scenes/generate-image] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
