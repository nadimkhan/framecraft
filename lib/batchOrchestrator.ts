import { prisma } from '@/lib/db';
import { GenerationStatus, ContentMode, Prisma } from '@prisma/client';
import { UploadStatus } from '@prisma/client';

export interface CreateBatchInput {
  name: string;
  description?: string;
  contentMode?: ContentMode;
  configJson?: Prisma.InputJsonValue;
}

export interface BatchWithVideos {
  id: string;
  name: string;
  description: string | null;
  contentMode: ContentMode;
  configJson: Prisma.JsonValue | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  videos: {
    id: number;
    title: string;
    generationStatus: GenerationStatus;
    uploadStatus: UploadStatus;
    orderIndex: number | null;
    topicId: number;
    description?: string | null;
    videoPath?: string | null;
    thumbnailPath?: string | null;
    topic?: {
      title: string;
    };
  }[];
  _count: {
    videos: number;
  };
}

class BatchOrchestratorService {
  async createBatch(input: CreateBatchInput): Promise<BatchWithVideos> {
    const batch = await prisma.batch.create({
      data: {
        name: input.name,
        description: input.description,
        contentMode: input.contentMode || 'single',
        configJson: input.configJson || {},
      },
      include: {
        videos: {
          select: {
            id: true,
            title: true,
            generationStatus: true,
            uploadStatus: true,
            orderIndex: true,
            topicId: true,
          },
        },
        _count: {
          select: { videos: true },
        },
      },
    });

    return batch as unknown as BatchWithVideos;
  }

  async getBatchById(id: string): Promise<BatchWithVideos | null> {
    return await prisma.batch.findUnique({
      where: { id },
      include: {
        videos: {
          select: {
            id: true,
            title: true,
            generationStatus: true,
            uploadStatus: true,
            orderIndex: true,
            topicId: true,
            description: true,
            tags: true,
            youtubeVideoId: true,
            videoPath: true,
            thumbnailPath: true,
            topic: {
              select: {
                title: true,
              },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
        _count: {
          select: { videos: true },
        },
      },
    }) as unknown as BatchWithVideos | null;
  }

  async listBatches(includeArchived = false): Promise<BatchWithVideos[]> {
    const batches = await prisma.batch.findMany({
      where: includeArchived ? {} : { archived: false },
      include: {
        videos: {
          select: {
            id: true,
            title: true,
            generationStatus: true,
            uploadStatus: true,
            orderIndex: true,
            topicId: true,
          },
        },
        _count: {
          select: { videos: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return batches as unknown as BatchWithVideos[];
  }

  async updateBatch(id: string, input: Partial<CreateBatchInput>): Promise<BatchWithVideos> {
    const updateData: Record<string, unknown> = {};
    
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.contentMode !== undefined) updateData.contentMode = input.contentMode;
    if (input.configJson !== undefined) updateData.configJson = input.configJson;

    const batch = await prisma.batch.update({
      where: { id },
      data: updateData,
      include: {
        videos: {
          select: {
            id: true,
            title: true,
            generationStatus: true,
            uploadStatus: true,
            orderIndex: true,
            topicId: true,
          },
        },
        _count: {
          select: { videos: true },
        },
      },
    });

    return batch as unknown as BatchWithVideos;
  }

  async archiveBatch(id: string): Promise<BatchWithVideos> {
    const batch = await prisma.batch.update({
      where: { id },
      data: { archived: true },
      include: {
        videos: {
          select: {
            id: true,
            title: true,
            generationStatus: true,
            uploadStatus: true,
            orderIndex: true,
            topicId: true,
          },
        },
        _count: {
          select: { videos: true },
        },
      },
    });

    return batch as unknown as BatchWithVideos;
  }

  async deleteBatch(id: string): Promise<{ success: boolean; message: string }> {
    const batch = await prisma.batch.findUnique({
      where: { id },
      include: { _count: { select: { videos: true } } },
    });

    if (!batch) {
      return { success: false, message: 'Batch not found' };
    }

    if (batch._count.videos > 0) {
      await prisma.video.updateMany({
        where: { batchId: id },
        data: { batchId: null },
      });
    }

    await prisma.batch.delete({
      where: { id },
    });

    return { success: true, message: 'Batch deleted successfully' };
  }

  async attachVideoToBatch(videoId: number, batchId: string): Promise<BatchWithVideos | null> {
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) {
      return null;
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { scenes: true },
    });

    let generationStatus: GenerationStatus = 'generating';
    if (video?.videoPath || (video?.scenes && video.scenes.length > 0 && video.scenes.some(s => s.imagePath))) {
      generationStatus = 'ready';
    }

    await prisma.video.update({
      where: { id: videoId },
      data: { 
        batchId,
        generationStatus,
      },
    });

    return this.getBatchById(batchId);
  }

  async removeVideoFromBatch(videoId: number): Promise<void> {
    await prisma.video.update({
      where: { id: videoId },
      data: { batchId: null },
    });
  }

  async moveVideoBetweenBatches(videoId: number, newBatchId: string | null): Promise<void> {
    await prisma.video.update({
      where: { id: videoId },
      data: { batchId: newBatchId },
    });
  }

  async reorderVideos(batchId: string, videoOrders: { videoId: number; orderIndex: number }[]): Promise<void> {
    for (const order of videoOrders) {
      await prisma.video.update({
        where: { id: order.videoId },
        data: { orderIndex: order.orderIndex },
      });
    }
  }

  async updateVideoGenerationStatus(videoId: number, status: GenerationStatus): Promise<void> {
    await prisma.video.update({
      where: { id: videoId },
      data: { generationStatus: status },
    });
  }

  async updateVideoUploadStatus(videoId: number, status: UploadStatus): Promise<void> {
    await prisma.video.update({
      where: { id: videoId },
      data: { uploadStatus: status },
    });
  }

  async getBatchProgress(batchId: string): Promise<{
    total: number;
    ready: number;
    failed: number;
    generating: number;
    percentage: number;
  }> {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        videos: {
          select: { generationStatus: true },
        },
      },
    });

    if (!batch) {
      return { total: 0, ready: 0, failed: 0, generating: 0, percentage: 0 };
    }

    const total = batch.videos.length;
    const ready = batch.videos.filter((v) => v.generationStatus === 'ready').length;
    const failed = batch.videos.filter((v) => v.generationStatus === 'failed').length;
    const generating = total - ready - failed;
    const percentage = total > 0 ? Math.round((ready / total) * 100) : 0;

    return { total, ready, failed, generating, percentage };
  }

  async getBatchByIdWithTabs(id: string): Promise<{
    new: BatchWithVideos['videos'];
    uploaded: BatchWithVideos['videos'];
  } | null> {
    const batch = await prisma.batch.findUnique({
      where: { id },
      include: {
        videos: {
          select: {
            id: true,
            title: true,
            generationStatus: true,
            uploadStatus: true,
            orderIndex: true,
            topicId: true,
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!batch) return null;

    return {
      new: batch.videos.filter(v => v.uploadStatus === 'new') as BatchWithVideos['videos'],
      uploaded: batch.videos.filter(v => v.uploadStatus === 'uploaded') as BatchWithVideos['videos'],
    };
  }
}

export const batchOrchestratorService = new BatchOrchestratorService();
