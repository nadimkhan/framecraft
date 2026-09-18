import { NextRequest, NextResponse } from 'next/server';
import { cleanupDuplicateBatchVideos } from '@/app/dashboard/videos/actions';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log(`[API] Cleanup duplicates called for batch: ${id}`);
    
    const result = await cleanupDuplicateBatchVideos(id);
    console.log(`[API] Cleanup result:`, result);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error cleaning up duplicates:', error);
    return NextResponse.json(
      { error: 'Failed to clean up duplicates' },
      { status: 500 }
    );
  }
}
