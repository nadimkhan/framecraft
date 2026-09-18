import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';

interface SceneInput {
  image: string;
  audio: string;
  narration?: string;
  sceneVideo?: string;
}

interface TopicRenderInput {
  topicId: string;
  title: string;
  scenes: SceneInput[];
}

interface BatchRenderRequest {
  topics: TopicRenderInput[];
  music?: string;
  title?: string;
  isFullVideo?: boolean;
}

interface TopicJobResult {
  topicId: string;
  title: string;
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  jobId?: string;
  videoUrl?: string;
  error?: string;
  progress?: number;
}

interface BatchJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  topics: TopicJobResult[];
  createdAt: number;
}

// In-memory batch job storage
const batchJobs = new Map<string, BatchJob>();

// Cleanup old batch jobs every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of batchJobs.entries()) {
    if (now - job.createdAt > 30 * 60 * 1000 && job.status !== 'processing') {
      batchJobs.delete(id);
    }
  }
}, 30 * 60 * 1000);

function generateBatchId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Build a SceneInput array for one topic by reading its scenes + assets from disk.
 * Reads from DB for the topic, then walks the scene folders to find image + audio files.
 */
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
      console.warn(`[render-batch] Skipping scene ${scene.id} - missing assets`);
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
 * Render one topic by spawning the same process as /api/render-video.
 * Returns the job record so the batch endpoint can track it.
 */
function spawnRender(
  scenes: SceneInput[],
  outputPath: string,
  music: string,
  title: string,
  nicheCategory: string | null
): { jobId: string; promise: Promise<{ success: boolean; error?: string; videoUrl?: string }> } {
  const jobId = `render-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const renderScript = path.join(process.cwd(), 'scripts', 'render-bundle.ts');
  const scenesJson = JSON.stringify(scenes);
  const titleArg = JSON.stringify(title);
  const metaArg = JSON.stringify({ nicheCategory });

  const proc = spawn(
    'npx',
    ['tsx', renderScript, scenesJson, outputPath, music, titleArg, metaArg],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    }
  );

  const promise = new Promise<{ success: boolean; error?: string; videoUrl?: string }>((resolve) => {
    let stderr = '';
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false, error: `Process exited with code ${code}: ${stderr.slice(0, 500)}` });
        return;
      }
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
        resolve({ success: false, error: 'Output file missing or too small' });
        return;
      }
      const videoUrl = outputPath.replace(path.join(process.cwd(), 'public'), '');
      resolve({ success: true, videoUrl });
    });
    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });

  return { jobId, promise };
}

/**
 * Compute output path for a topic.
 * Mirrors the layout the topic's scene folders use (one MP4 per topic folder).
 */
function topicOutputPath(sceneDir: string): string {
  // sceneDir looks like .../public/generations/<Topic Title>/scene_0
  const topicFolder = path.dirname(sceneDir);
  // Title is the folder name — sanitize for filesystem
  return path.join(topicFolder, 'video.mp4');
}

export async function POST(request: NextRequest) {
  try {
    const body: BatchRenderRequest = await request.json();

    // Accept either explicit scenes[] OR a topicId[] to render from DB
    let topics: TopicRenderInput[] = body.topics || [];

    // If body has a single topicId, treat as single-topic batch
    if ((body as any).topicId) {
      const built = await buildScenesForTopic((body as any).topicId);
      if (!built) {
        return NextResponse.json({ error: `Topic ${(body as any).topicId} not found` }, { status: 404 });
      }
      topics = [{ topicId: (body as any).topicId, title: built.title, scenes: built.scenes }];
    }

    if (topics.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: topics array or topicId is required' },
        { status: 400 }
      );
    }

    const batchId = generateBatchId();
    const music = body.music || '';
    const sharedTitle = body.title || '';

    // Initialize batch job record
    const topicJobs: TopicJobResult[] = topics.map((t) => ({
      topicId: t.topicId,
      title: t.title,
      status: 'pending',
    }));
    batchJobs.set(batchId, {
      id: batchId,
      status: 'pending',
      topics: topicJobs,
      createdAt: Date.now(),
    });

    // Kick off renders in parallel — they will fight for the GPU but that's the
    // user's call when they queue many at once. The honest answer: serialize if
    // you want predictable GPU sharing, parallel if you want max throughput.
    // For batch we serialize (one at a time) so the GPU isn't overloaded.
    (async () => {
      const batch = batchJobs.get(batchId)!;
      batch.status = 'processing';

      let completed = 0;
      let failed = 0;
      for (let i = 0; i < topics.length; i++) {
        const topic = topics[i];
        const tj = batch.topics[i];
        tj.status = 'rendering';
        tj.progress = Date.now();

        try {
          // Look up the topic's scenes + niche via DB (the request payload often
          // only has topicId; the API needs the actual scene assets and niche).
          const built = await buildScenesForTopic(topic.topicId)
          if (!built || built.scenes.length === 0) {
            tj.status = 'failed'
            tj.error = 'No scenes with both image and audio assets'
            failed++
            continue
          }
          const firstImageFull = path.join(
            process.cwd(),
            'public',
            built.scenes[0].image.replace(/^\//, '')
          )
          const sceneDir = path.dirname(firstImageFull)
          const outputPath = topicOutputPath(sceneDir)

          const { jobId, promise } = spawnRender(
            built.scenes, outputPath, music,
            sharedTitle || built.title, built.nicheCategory
          )
          tj.jobId = jobId

          const result = await promise;
          if (result.success) {
            tj.status = 'completed';
            tj.videoUrl = result.videoUrl;
            tj.progress = Date.now();
            completed++;
          } else {
            tj.status = 'failed';
            tj.error = result.error;
            tj.progress = Date.now();
            failed++;
          }
        } catch (e: any) {
          tj.status = 'failed';
          tj.error = e?.message || String(e);
          failed++;
        }
      }

      if (failed === 0) batch.status = 'completed';
      else if (completed === 0) batch.status = 'failed';
      else batch.status = 'partial';
    })();

    return NextResponse.json({
      success: true,
      batchId,
      status: 'pending',
      message: `Batch render started for ${topics.length} topic(s)`,
      topicCount: topics.length,
    });
  } catch (error) {
    console.error('Error in batch render:', error);
    return NextResponse.json(
      { error: 'Failed to start batch render', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get('batchId');
  const topicId = request.nextUrl.searchParams.get('topicId');

  // Backwards-compat: GET ?jobId=<id> for single renders still works via /api/render-video.
  if (!batchId) {
    return NextResponse.json({
      message: 'Batch video render API',
      usage: 'POST with { topics: [{ topicId, title, scenes: [...] }], music?: string, title?: string } OR { topicId } for single-topic batch',
      get: 'GET ?batchId=<id> to check status',
    });
  }

  const job = batchJobs.get(batchId);
  if (!job) {
    return NextResponse.json({ error: 'Batch job not found' }, { status: 404 });
  }

  // If a specific topicId is requested, return just that slice
  if (topicId) {
    const topicJob = job.topics.find((t) => t.topicId === topicId);
    if (!topicJob) {
      return NextResponse.json({ error: `Topic ${topicId} not in batch ${batchId}` }, { status: 404 });
    }
    return NextResponse.json({ batchId, ...topicJob });
  }

  return NextResponse.json(job);
}
