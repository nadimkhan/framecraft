import { NextRequest, NextResponse } from 'next/server';
import { batchOrchestratorService } from '@/lib/batchOrchestrator';
import { ContentMode } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const includeArchived = searchParams.get('includeArchived') === 'true';
    
    const batches = await batchOrchestratorService.listBatches(includeArchived);
    
    const batchesWithProgress = await Promise.all(
      batches.map(async (batch) => {
        const progress = await batchOrchestratorService.getBatchProgress(batch.id);
        return {
          ...batch,
          progress,
        };
      })
    );
    
    return NextResponse.json(batchesWithProgress);
  } catch (error) {
    console.error('Error listing batches:', error);
    return NextResponse.json(
      { error: 'Failed to list batches' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, contentMode, configJson, videosPerDay, aspectRatio } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Batch name is required' },
        { status: 400 }
      );
    }

    const validContentModes: ContentMode[] = ['single', 'series', 'long_form', 'calendar'];
    const mode = contentMode && validContentModes.includes(contentMode) 
      ? contentMode 
      : 'single';

    const batch = await batchOrchestratorService.createBatch({
      name,
      description,
      contentMode: mode,
      configJson: { ...configJson, videosPerDay: videosPerDay || 2, aspectRatio: aspectRatio || 'portrait' },
    });

    return NextResponse.json(batch, { status: 201 });
  } catch (error) {
    console.error('Error creating batch:', error);
    return NextResponse.json(
      { error: 'Failed to create batch' },
      { status: 500 }
    );
  }
}
