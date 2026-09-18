import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { youtubeVideoId, action } = body;

    console.log('[PATCH /api/videos] id:', id, 'body:', body);

    const videoId = parseInt(id);
    if (isNaN(videoId)) {
      return NextResponse.json(
        { error: 'Invalid video ID' },
        { status: 400 }
      );
    }

    if (action === 'setYoutubeId') {
      if (!youtubeVideoId) {
        return NextResponse.json(
          { error: 'YouTube Video ID is required' },
          { status: 400 }
        );
      }

      console.log('[PATCH] Updating video', videoId, 'with youtubeVideoId:', youtubeVideoId);
      
      const video = await prisma.video.update({
        where: { id: videoId },
        data: { 
          youtubeVideoId
        },
      });

      console.log('[PATCH] Updated video:', video.id, 'youtubeVideoId:', video.youtubeVideoId, 'uploadStatus:', video.uploadStatus);

      return NextResponse.json({
        success: true,
        videoId: video.id,
        youtubeVideoId: video.youtubeVideoId,
      });
    }

    if (action === 'clearYoutubeId') {
      console.log('[PATCH] Clearing youtubeVideoId for video', videoId);
      
      const video = await prisma.video.update({
        where: { id: videoId },
        data: { 
          youtubeVideoId: null
        },
      });

      console.log('[PATCH] Cleared youtubeVideoId for video:', video.id);

      return NextResponse.json({
        success: true,
        videoId: video.id,
        youtubeVideoId: null,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[PATCH] Error updating video:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update video' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const videoId = parseInt(id, 10);

    if (isNaN(videoId)) {
      return NextResponse.json(
        { error: 'Invalid video ID' },
        { status: 400 }
      );
    }

    // Get video with scenes to clean up files
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { 
        scenes: true,
        topic: true,
      },
    });

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    // Delete associated files
    for (const scene of video.scenes) {
      if (scene.imagePath) {
        const imagePath = path.join(process.cwd(), 'public', scene.imagePath.replace(/^\//, ''));
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
      if (scene.audioPath) {
        const audioPath = path.join(process.cwd(), 'public', scene.audioPath.replace(/^\//, ''));
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      }
    }

    // Delete video file if exists
    if (video.videoPath) {
      const videoFilePath = path.join(process.cwd(), 'public', video.videoPath.replace(/^\//, ''));
      if (fs.existsSync(videoFilePath)) {
        fs.unlinkSync(videoFilePath);
      }
    }

    // Delete thumbnail if exists
    if (video.thumbnailPath) {
      const thumbnailPath = path.join(process.cwd(), 'public', video.thumbnailPath.replace(/^\//, ''));
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
      }
    }

    // Delete video and scenes from database
    await prisma.scene.deleteMany({
      where: { videoId },
    });

    await prisma.video.delete({
      where: { id: videoId },
    });

    return NextResponse.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Error deleting video:', error);
    return NextResponse.json(
      { error: 'Failed to delete video' },
      { status: 500 }
    );
  }
}
