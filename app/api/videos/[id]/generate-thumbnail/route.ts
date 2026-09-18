import { NextRequest, NextResponse } from 'next/server';
import { generateThumbnail } from '@/lib/thumbnail';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const videoId = parseInt(resolvedParams.id, 10);
    
    if (isNaN(videoId)) {
      return NextResponse.json(
        { error: 'Invalid video ID' },
        { status: 400 }
      );
    }
    
    console.log(`[generate-thumbnail] Starting thumbnail generation for video ${videoId}`);
    
    const result = await generateThumbnail({ videoId });
    
    if (!result.success) {
      console.error(`[generate-thumbnail] Failed: ${result.error}`);
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }
    
    console.log(`[generate-thumbnail] Success: ${result.thumbnailPath}`);
    
    return NextResponse.json({
      success: true,
      thumbnailPath: result.thumbnailPath,
    });
    
  } catch (error) {
    console.error('[generate-thumbnail] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate thumbnail' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    message: 'Generate Thumbnail API',
    usage: 'POST to generate thumbnail for video',
  });
}
