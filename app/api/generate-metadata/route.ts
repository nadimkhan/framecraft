import { NextRequest, NextResponse } from 'next/server';
import { generateYouTubeMetadataFromTitle } from '@/lib/ai';
import prisma from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { title, videoId } = await request.json();

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    const metadata = await generateYouTubeMetadataFromTitle(title);

    // If videoId is provided, save to database
    if (videoId && typeof videoId === 'number') {
      await prisma.video.update({
        where: { id: videoId },
        data: {
          description: metadata.description,
          tags: metadata.tags.join(', '),
        },
      });
      console.log(`[generate-metadata] Saved metadata for video ${videoId}`);
    }

    return NextResponse.json(metadata);
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