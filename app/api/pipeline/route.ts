import { NextRequest, NextResponse } from 'next/server';
import { pipelineService, PIPELINE_STAGES } from '@/lib/pipelineService';
import { executeStageAction } from '@/lib/pipelineExecutor';

export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get('batchId');

  if (!batchId) {
    return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
  }

  try {
    const board = await pipelineService.getPipelineBoard(batchId);
    return NextResponse.json(board);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId, stage, execute } = body;

    if (!videoId || !stage) {
      return NextResponse.json(
        { error: 'videoId and stage are required' },
        { status: 400 }
      );
    }

    if (!PIPELINE_STAGES.includes(stage)) {
      return NextResponse.json(
        { error: `Invalid stage: ${stage}. Valid: ${PIPELINE_STAGES.join(', ')}` },
        { status: 400 }
      );
    }

    // 1. Move the video to the target stage
    const video = await pipelineService.moveVideo(videoId, stage);

    // 2. Execute the stage action (generate script, images, voice, render)
    let actionResult = null;
    if (execute !== false) {
      actionResult = await executeStageAction(videoId, stage);
    }

    return NextResponse.json({
      success: true,
      video,
      action: actionResult,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
