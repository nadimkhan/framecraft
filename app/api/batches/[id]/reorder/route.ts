import { NextRequest, NextResponse } from 'next/server';
import { batchOrchestratorService } from '@/lib/batchOrchestrator';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { videoOrders } = body;
    
    if (!Array.isArray(videoOrders) || videoOrders.length === 0) {
      return NextResponse.json(
        { error: 'videoOrders array is required' },
        { status: 400 }
      );
    }
    
    await batchOrchestratorService.reorderVideos(id, videoOrders);
    
    const batch = await batchOrchestratorService.getBatchById(id);
    
    return NextResponse.json(batch);
  } catch (error) {
    console.error('Error reordering videos:', error);
    return NextResponse.json(
      { error: 'Failed to reorder videos' },
      { status: 500 }
    );
  }
}
