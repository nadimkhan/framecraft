import { NextRequest, NextResponse } from 'next/server';
import { batchOrchestratorService } from '@/lib/batchOrchestrator';

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
    const { batchId, action } = body;
    
    if (action === 'remove') {
      await batchOrchestratorService.removeVideoFromBatch(videoId);
      return NextResponse.json({ message: 'Video removed from batch' });
    }
    
    if (!batchId) {
      return NextResponse.json(
        { error: 'batchId is required' },
        { status: 400 }
      );
    }
    
    const batch = await batchOrchestratorService.attachVideoToBatch(videoId, batchId);
    
    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(batch);
  } catch (error) {
    console.error('Error updating video batch:', error);
    return NextResponse.json(
      { error: 'Failed to update video batch' },
      { status: 500 }
    );
  }
}
