import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
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
    
    const body = await request.json();
    const { uploadStatus } = body;
    
    if (!uploadStatus || !['new', 'uploaded'].includes(uploadStatus)) {
      return NextResponse.json(
        { error: 'Valid uploadStatus is required (new or uploaded)' },
        { status: 400 }
      );
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
    });

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    await prisma.video.update({
      where: { id: videoId },
      data: { uploadStatus },
    });

    return NextResponse.json({ 
      message: 'Upload status updated',
      videoId,
      uploadStatus,
    });
  } catch (error) {
    console.error('Error updating upload status:', error);
    return NextResponse.json(
      { error: 'Failed to update upload status' },
      { status: 500 }
    );
  }
}
