import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import path from 'path'
import fs from 'fs'

export async function POST(request: NextRequest) {
  try {
    const { sceneId } = await request.json()

    if (!sceneId) {
      return NextResponse.json({ error: 'Scene ID required' }, { status: 400 })
    }

    const scene = await prisma.scene.findUnique({
      where: { id: sceneId }
    })

    if (!scene) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 })
    }

    if (scene.sceneVideoPath) {
      const fullPath = path.join(process.cwd(), 'public', scene.sceneVideoPath.replace(/^\//, ''))
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath)
      }

      await prisma.scene.update({
        where: { id: sceneId },
        data: { sceneVideoPath: null }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting scene video:', error)
    return NextResponse.json({ error: 'Failed to delete scene video' }, { status: 500 })
  }
}
