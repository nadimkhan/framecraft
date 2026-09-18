import { prisma } from '@/lib/db';
import { PipelineStage, Prisma } from '@prisma/client';

// Pipeline stage order
export const PIPELINE_STAGES: PipelineStage[] = [
  'draft',
  'script',
  'images',
  'voiceover',
  'render',
  'review',
  'uploaded',
];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  draft: '📝 Draft',
  script: '📜 Script',
  images: '🖼️ Images',
  voiceover: '🎙️ Voiceover',
  render: '🎬 Render',
  review: '👁️ Review',
  uploaded: '✅ Uploaded',
};

export interface PipelineVideo {
  id: number;
  title: string;
  pipelineStage: PipelineStage;
  durationSeconds: number;
  videoPath: string | null;
  thumbnailPath: string | null;
  orderIndex: number | null;
  generationStatus: string;
  scenes: PipelineScene[];
}

export interface PipelineScene {
  id: number;
  index: number;
  narration: string;
  prompt: string;
  imagePath: string | null;
  audioPath: string | null;
}

export interface PipelineBoard {
  batchId: string;
  batchName: string;
  stages: Record<PipelineStage, PipelineVideo[]>;
  totalVideos: number;
}

class PipelineService {
  async getPipelineBoard(batchId: string): Promise<PipelineBoard> {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        videos: {
          include: { scenes: { orderBy: { index: 'asc' } } },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    const stages: Record<string, PipelineVideo[]> = {};
    for (const stage of PIPELINE_STAGES) {
      stages[stage] = [];
    }

    for (const video of batch.videos) {
      const stage = video.pipelineStage as PipelineStage;
      stages[stage].push({
        id: video.id,
        title: video.title,
        pipelineStage: stage,
        durationSeconds: video.durationSeconds,
        videoPath: video.videoPath,
        thumbnailPath: video.thumbnailPath,
        orderIndex: video.orderIndex,
        generationStatus: video.generationStatus,
        scenes: video.scenes.map((s) => ({
          id: s.id,
          index: s.index,
          narration: s.narration,
          prompt: s.prompt,
          imagePath: s.imagePath,
          audioPath: s.audioPath,
        })),
      });
    }

    return {
      batchId: batch.id,
      batchName: batch.name,
      stages: stages as Record<PipelineStage, PipelineVideo[]>,
      totalVideos: batch.videos.length,
    };
  }

  async advanceStage(videoId: number, targetStage?: PipelineStage): Promise<PipelineVideo> {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { scenes: { orderBy: { index: 'asc' } } },
    });

    if (!video) throw new Error(`Video ${videoId} not found`);

    const currentIndex = PIPELINE_STAGES.indexOf(video.pipelineStage as PipelineStage);
    const nextIndex = targetStage
      ? PIPELINE_STAGES.indexOf(targetStage)
      : currentIndex + 1;

    if (nextIndex <= currentIndex || nextIndex >= PIPELINE_STAGES.length) {
      // Allow going to 'draft' as a reset
      if (targetStage === 'draft') {
        await prisma.video.update({
          where: { id: videoId },
          data: { pipelineStage: 'draft' },
        });
        return { ...video, pipelineStage: 'draft' } as PipelineVideo;
      }
      throw new Error(`Cannot advance from ${video.pipelineStage}`);
    }

    const nextStage = PIPELINE_STAGES[nextIndex];

    await prisma.video.update({
      where: { id: videoId },
      data: { pipelineStage: nextStage },
    });

    return {
      id: video.id,
      title: video.title,
      pipelineStage: nextStage,
      durationSeconds: video.durationSeconds,
      videoPath: video.videoPath,
      thumbnailPath: video.thumbnailPath,
      orderIndex: video.orderIndex,
      generationStatus: video.generationStatus,
      scenes: video.scenes.map((s) => ({
        id: s.id,
        index: s.index,
        narration: s.narration,
        prompt: s.prompt,
        imagePath: s.imagePath,
        audioPath: s.audioPath,
      })),
    };
  }

  async moveVideo(videoId: number, stage: PipelineStage): Promise<PipelineVideo> {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { scenes: { orderBy: { index: 'asc' } } },
    });

    if (!video) throw new Error(`Video ${videoId} not found`);

    await prisma.video.update({
      where: { id: videoId },
      data: { pipelineStage: stage },
    });

    return {
      id: video.id,
      title: video.title,
      pipelineStage: stage,
      durationSeconds: video.durationSeconds,
      videoPath: video.videoPath,
      thumbnailPath: video.thumbnailPath,
      orderIndex: video.orderIndex,
      generationStatus: video.generationStatus,
      scenes: video.scenes.map((s) => ({
        id: s.id,
        index: s.index,
        narration: s.narration,
        prompt: s.prompt,
        imagePath: s.imagePath,
        audioPath: s.audioPath,
      })),
    };
  }
}

export const pipelineService = new PipelineService();
