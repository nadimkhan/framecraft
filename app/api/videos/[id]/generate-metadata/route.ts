import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { generateYouTubeMetadataFromTitle } from '@/lib/ai';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const { videoId } = await request.json();

    if (!videoId || typeof videoId !== 'number') {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      );
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { topic: true }
    });

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    const title = video.topic?.title || video.title;
    const metadata = await generateYouTubeMetadataFromTitle(title);

    const updatedVideo = await prisma.video.update({
      where: { id: videoId },
      data: {
        description: metadata.description,
        tags: metadata.tags.join(', ')
      }
    });

    return NextResponse.json({
      success: true,
      videoId: updatedVideo.id,
      description: updatedVideo.description,
      tags: updatedVideo.tags
    });
  } catch (error) {
    console.error('Error generating YouTube metadata:', error);
    
    if (error instanceof Error && error.name === 'RateLimitError') {
      return NextResponse.json(
        { error: error.message },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate metadata' },
      { status: 500 }
    );
  }
}