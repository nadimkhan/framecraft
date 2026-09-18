import { NextRequest, NextResponse } from 'next/server';
import { batchOrchestratorService } from '@/lib/batchOrchestrator';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const batch = await batchOrchestratorService.getBatchById(id);
    
    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      );
    }

    if (batch.videos.length === 0) {
      return NextResponse.json(
        { error: 'No videos in batch' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: 'Batch is ready',
      batchId: id,
      videoCount: batch.videos.length,
    });
  } catch (error) {
    console.error('Error accessing batch:', error);
    return NextResponse.json(
      { error: 'Failed to access batch' },
      { status: 500 }
    );
  }
}
