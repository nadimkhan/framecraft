import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const topicId = parseInt(id, 10);
    
    if (isNaN(topicId)) {
      return NextResponse.json(
        { error: 'Invalid topic ID' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    const { batchId } = body;
    
    if (!batchId) {
      return NextResponse.json(
        { error: 'batchId is required' },
        { status: 400 }
      );
    }

    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: { video: true },
    });

    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found' },
        { status: 404 }
      );
    }

    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      );
    }

    let videoId: number;

    if (topic.video) {
      const scenesWithImages = await prisma.scene.findMany({
        where: { 
          videoId: topic.video.id,
          imagePath: { not: null }
        }
      });
      const hasExistingAssets = !!topic.video.videoPath || scenesWithImages.length > 0;

      await prisma.video.update({
        where: { id: topic.video.id },
        data: { 
          batchId,
          generationStatus: hasExistingAssets ? 'ready' : 'generating',
        },
      });
      videoId = topic.video.id;
    } else {
      const newVideo = await prisma.video.create({
        data: {
          topicId: topic.id,
          title: topic.title,
          narration: '',
          durationSeconds: 45,
          batchId,
          generationStatus: 'generating',
          uploadStatus: 'new',
        },
      });
      videoId = newVideo.id;
    }

    return NextResponse.json({ 
      message: 'Topic added to batch successfully',
      videoId,
      batchId,
    });
  } catch (error) {
    console.error('Error attaching topic to batch:', error);
    return NextResponse.json(
      { error: 'Failed to attach topic to batch' },
      { status: 500 }
    );
  }
}
