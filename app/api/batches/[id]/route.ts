import { NextRequest, NextResponse } from 'next/server';
import { batchOrchestratorService } from '@/lib/batchOrchestrator';
import fs from 'fs';
import path from 'path';
import { sanitizeFolderName } from '@/lib/tts';

export async function GET(
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
    
    const progress = await batchOrchestratorService.getBatchProgress(id);
    
    // Check for Windows-rendered videos on disk
    const videosWithWindowsPath = batch.videos.map(video => {
      // If videoPath is already set, use it
      if (video.videoPath && fs.existsSync(path.join(process.cwd(), 'public', video.videoPath.replace(/^\//, '')))) {
        return video;
      }
      
      // Otherwise check for Windows-rendered video
      const topicTitle = video.topic?.title || video.title;
      const sanitizedTitle = sanitizeFolderName(topicTitle);
      const windowsVideoPath = `/generations/${sanitizedTitle}/${sanitizedTitle}.mp4`;
      const fullPath = path.join(process.cwd(), 'public', windowsVideoPath.replace(/^\//, ''));
      
      if (fs.existsSync(fullPath)) {
        return {
          ...video,
          videoPath: windowsVideoPath,
          generationStatus: 'ready'
        };
      }
      
      return video;
    });

    // Remove duplicates - keep only one video per topicId (first occurrence)
    const seenTopicIds = new Set<number>();
    const uniqueVideos = videosWithWindowsPath.filter(video => {
      if (seenTopicIds.has(video.topicId)) {
        return false;
      }
      seenTopicIds.add(video.topicId);
      return true;
    });
    
    return NextResponse.json({
      ...batch,
      videos: uniqueVideos,
      progress,
    });
  } catch (error) {
    console.error('Error getting batch:', error);
    return NextResponse.json(
      { error: 'Failed to get batch' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, contentMode, configJson } = body;
    
    const batch = await batchOrchestratorService.updateBatch(id, {
      name,
      description,
      contentMode,
      configJson,
    });
    
    return NextResponse.json(batch);
  } catch (error) {
    console.error('Error updating batch:', error);
    return NextResponse.json(
      { error: 'Failed to update batch' },
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
    const result = await batchOrchestratorService.deleteBatch(id);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json({ message: result.message });
  } catch (error) {
    console.error('Error deleting batch:', error);
    return NextResponse.json(
      { error: 'Failed to delete batch' },
      { status: 500 }
    );
  }
}
