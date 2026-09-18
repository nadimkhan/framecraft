import { prisma } from '@/lib/db';
import { GenerationStatus } from '@prisma/client';

export interface QueueJob {
  id: string;
  type: 'script' | 'assets' | 'narration' | 'render';
  videoId: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

class GenerationQueueService {
  private jobs: Map<string, QueueJob> = new Map();

  async addJob(videoId: number, type: QueueJob['type']): Promise<string> {
    const jobId = `${type}-${videoId}-${Date.now()}`;
    
    const job: QueueJob = {
      id: jobId,
      type,
      videoId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.jobs.set(jobId, job);
    
    this.processJob(jobId);
    
    return jobId;
  }

  private async processJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'processing';
    this.jobs.set(jobId, job);

    try {
      switch (job.type) {
        case 'script':
          await this.generateScript(job.videoId);
          break;
        case 'assets':
          await this.generateAssets(job.videoId);
          break;
        case 'narration':
          await this.generateNarration(job.videoId);
          break;
        case 'render':
          await this.renderVideo(job.videoId);
          await this.updateVideoStatus(job.videoId, 'ready');
          break;
      }

      job.status = 'completed';
      job.updatedAt = new Date();
      this.jobs.set(jobId, job);
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.updatedAt = new Date();
      this.jobs.set(jobId, job);
      
      await this.updateVideoStatus(job.videoId, 'failed');
    }
  }

  private async generateScript(videoId: number): Promise<void> {
    console.log(`[Queue] Generating script for video ${videoId}`);
  }

  private async generateAssets(videoId: number): Promise<void> {
    console.log(`[Queue] Generating assets for video ${videoId}`);
  }

  private async generateNarration(videoId: number): Promise<void> {
    console.log(`[Queue] Generating narration for video ${videoId}`);
  }

  private async renderVideo(videoId: number): Promise<void> {
    console.log(`[Queue] Rendering video ${videoId}`);
  }

  private async updateVideoStatus(videoId: number, status: GenerationStatus): Promise<void> {
    await prisma.video.update({
      where: { id: videoId },
      data: { generationStatus: status },
    });
  }

  getJobStatus(jobId: string): QueueJob | undefined {
    return this.jobs.get(jobId);
  }

  async getVideoJobs(videoId: number): Promise<QueueJob[]> {
    return Array.from(this.jobs.values()).filter(job => job.videoId === videoId);
  }
}

export const generationQueueService = new GenerationQueueService();
