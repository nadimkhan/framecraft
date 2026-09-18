import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { prisma } from '@/lib/db';

interface SceneInput {
  image: string;
  audio: string;
  narration?: string;
}

interface JobStatus {
  id: string;
  topicId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
  progress?: number;
}

// In-memory per-topic render job map
const topicJobs = new Map<string, JobStatus>();

// Cleanup old jobs after 30 min
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of topicJobs.entries()) {
    if (now - (job.progress || 0) > 30 * 60 * 1000 && job.status !== 'processing') {
      topicJobs.delete(id);
    }
  }
}, 30 * 60 * 1000);

function generateJobId(): string {
  return `render-topic-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

async function buildScenesForTopic(topicId: string): Promise<{ scenes: SceneInput[]; title: string; nicheCategory: string | null } | null> {
  const id = parseInt(topicId, 10);
  if (isNaN(id)) return null;
  const topic = await prisma.topic.findUnique({
    where: { id },
    include: {
      series: { include: { niche: { select: { category: true } } } },
      video: {
        include: { scenes: { orderBy: { index: 'asc' } } },
      },
    },
  });
  if (!topic) return null;

  const videoScenes = topic.video?.scenes || [];
  const scenes: SceneInput[] = [];
  for (const scene of videoScenes) {
    const imageRel = scene.imagePath || '';
    const audioRel = scene.audioPath || '';
    if (!imageRel || !audioRel) continue;

    const imageFull = path.join(process.cwd(), 'public', imageRel.replace(/^\//, ''));
    const audioFull = path.join(process.cwd(), 'public', audioRel.replace(/^\//, ''));

    if (!fs.existsSync(imageFull) || !fs.existsSync(audioFull)) {
      console.warn(`[render-topic] Skipping scene ${scene.id} - missing assets`);
      continue;
    }

    scenes.push({
      image: imageRel,
      audio: audioRel,
      narration: scene.narration || undefined,
    });
  }

  return { scenes, title: topic.title, nicheCategory: topic.series?.niche?.category ?? null };
}

/**
 * POST /api/render-topic
 * Body: { topicId: string, music?: string }
 *
 * Renders a single topic (all scenes stitched into one MP4) using the same
 * render-bundle.ts script as /api/render-video. The output goes to
 *   /public/generations/<topic title>/video.mp4
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const topicId = body.topicId as string;
    const music = (body.music as string) || '';

    if (!topicId) {
      return NextResponse.json({ error: 'topicId is required' }, { status: 400 });
    }

    const built = await buildScenesForTopic(topicId);
    if (!built) {
      return NextResponse.json({ error: `Topic ${topicId} not found` }, { status: 404 });
    }
    if (built.scenes.length === 0) {
      return NextResponse.json(
        { error: `Topic ${topicId} has no scenes with both image and audio assets` },
        { status: 400 }
      );
    }

    // Compute output path from the first scene's directory
    const firstImageFull = path.join(
      process.cwd(),
      'public',
      built.scenes[0].image.replace(/^\//, '')
    );
    const sceneDir = path.dirname(firstImageFull);
    const topicFolder = path.dirname(sceneDir);
    const outputPath = path.join(topicFolder, 'video.mp4');

    const jobId = generateJobId();
    topicJobs.set(jobId, {
      id: jobId,
      topicId,
      status: 'pending',
      progress: Date.now(),
    });

    const renderScript = path.join(process.cwd(), 'scripts', 'render-bundle.ts');
    const scenesJson = JSON.stringify(built.scenes);
    const titleArg = JSON.stringify(built.title);
    const metaArg = JSON.stringify({ nicheCategory: built.nicheCategory });

    const proc = spawn(
      'npx',
      ['tsx', renderScript, scenesJson, outputPath, music, titleArg, metaArg],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      }
    );

    let stderr = '';
    proc.stderr?.on('data', (d) => {
      const msg = d.toString();
      stderr += msg;
      console.log(`[Render ${jobId}] ${msg}`);
    });
    proc.on('error', (err) => {
      console.error(`[Render ${jobId}] Process error:`, err);
      const job = topicJobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = `Process error: ${err.message}`;
        job.progress = Date.now();
      }
    });

    // Flip to processing immediately
    {
      const job = topicJobs.get(jobId)!;
      job.status = 'processing';
      job.progress = Date.now();
    }

    // Track file growth to mark completion once the file is stable.
    let lastSize = 0;
    let stableCount = 0;
    let procClosed = false;
    proc.on('close', (code) => {
      procClosed = true;
      const job = topicJobs.get(jobId);
      if (!job) return;
      if (code !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
        job.status = 'failed';
        job.error = `Process exited with code ${code}: ${stderr.slice(0, 500)}`;
        job.progress = Date.now();
      }
      // If successful, the file-stability watcher will mark as completed.
    });

    const checkInterval = setInterval(() => {
      const job = topicJobs.get(jobId);
      if (!job) {
        clearInterval(checkInterval);
        return;
      }
      if (fs.existsSync(outputPath)) {
        const size = fs.statSync(outputPath).size;
        if (size === lastSize && size > 1000) stableCount++;
        else stableCount = 0;
        lastSize = size;
        if (stableCount >= 2 && procClosed) {
          clearInterval(checkInterval);
          const videoUrl = outputPath.replace(path.join(process.cwd(), 'public'), '');
          job.status = 'completed';
          job.videoUrl = videoUrl;
          job.progress = Date.now();
        }
      }
      // Timeout after 30 min
      if (Date.now() - (job.progress || Date.now()) > 30 * 60 * 1000 && job.status === 'processing') {
        clearInterval(checkInterval);
        job.status = 'failed';
        job.error = 'Render timeout after 30 minutes';
        job.progress = Date.now();
      }
    }, 5000);

    return NextResponse.json({
      success: true,
      jobId,
      topicId,
      title: built.title,
      status: 'processing',
      message: 'Render started',
      sceneCount: built.scenes.length,
    });
  } catch (error) {
    console.error('Error rendering topic video:', error);
    return NextResponse.json(
      { error: 'Failed to render topic video', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/render-topic?jobId=<id>
 * Returns current job status (status, videoUrl, error, progress).
 */
export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({
      message: 'Render a single topic into one MP4',
      usage: 'POST { topicId, music? } to start, GET ?jobId=<id> to poll',
    });
  }

  const job = topicJobs.get(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json(job);
}
