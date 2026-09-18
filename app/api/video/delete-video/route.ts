import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import path from 'path'
import fs from 'fs'
import { sanitizeFolderName } from '@/lib/tts'

export async function POST(request: NextRequest) {
  try {
    const { videoId } = await request.json()

    if (!videoId) {
      return NextResponse.json({ error: 'Video ID required' }, { status: 400 })
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { topic: true }
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    let videoPathToDelete = video.videoPath

    // If no videoPath in DB, check for Windows-rendered video on disk
    if (!videoPathToDelete && video.topic?.title) {
      const sanitizedTitle = sanitizeFolderName(video.topic.title)
      const windowsVideoPath = `/generations/${sanitizedTitle}/${sanitizedTitle}.mp4`
      const fullPath = path.join(process.cwd(), 'public', windowsVideoPath.replace(/^\//, ''))
      
      if (fs.existsSync(fullPath)) {
        videoPathToDelete = windowsVideoPath
      }
    }

    if (videoPathToDelete) {
      const fullPath = path.join(process.cwd(), 'public', videoPathToDelete.replace(/^\//, ''))
      console.log('[delete-video] Attempting to delete:', fullPath)
      
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath)
        console.log('[delete-video] File deleted successfully')
      } else {
        console.log('[delete-video] File not found at path:', fullPath)
      }

      await prisma.video.update({
        where: { id: videoId },
        data: { videoPath: null, generationStatus: 'generating' }
      })
    } else {
      console.log('[delete-video] No videoPath to delete')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting video:', error)
    return NextResponse.json({ error: 'Failed to delete video' }, { status: 500 })
  }
}
