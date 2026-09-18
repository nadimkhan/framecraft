import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import path from 'path';
import fs from 'fs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const POLL_INTERVAL = 5000;
const MAX_POLL_ATTEMPTS = 720; // 60 min max

async function pollForCompletion(jobId: string): Promise<{ videoUrl?: string; error?: string }> {
  const start = Date.now();
  while (Date.now() - start < MAX_POLL_ATTEMPTS * POLL_INTERVAL) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
    try {
      const r = await fetch(`${APP_URL}/api/render-video?jobId=${jobId}`);
      if (!r.ok) continue;
      const job = await r.json();
      if (job.status === 'completed') return { videoUrl: job.videoUrl };
      if (job.status === 'failed') return { error: job.error };
    } catch { /* keep polling */ }
  }
  return { error: 'Render poll timeout' };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId } = body;

    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: {
        topic: true,
        scenes: { orderBy: { index: 'asc' } },
      },
    });

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // Step 1: Delete old full video
    if (video.videoPath) {
      const oldPath = path.join(process.cwd(), 'public', video.videoPath.replace(/^\//, ''));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    // Step 2: Re-render each scene clip that has both image and audio
    const scenesToRender = video.scenes.filter(s => s.imagePath && s.audioPath);
    for (const scene of scenesToRender) {
      // Delete old scene clip
      if (scene.sceneVideoPath) {
        const oldClip = path.join(process.cwd(), 'public', scene.sceneVideoPath.replace(/^\//, ''));
        if (fs.existsSync(oldClip)) fs.unlinkSync(oldClip);
      }

      // Trigger render
      const jobRes = await fetch(`${APP_URL}/api/render-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: [{
            image: scene.imagePath!,
            audio: scene.audioPath!,
            narration: scene.narration || '',
          }],
        }),
      });

      if (!jobRes.ok) {
        console.error(`[RenderFull] Failed to trigger render for scene ${scene.id}`);
        continue;
      }

      const { jobId } = await jobRes.json();
      const result = await pollForCompletion(jobId);

      if (result.videoUrl) {
        await prisma.scene.update({
          where: { id: scene.id },
          data: { sceneVideoPath: result.videoUrl },
        });
      }
    }

    // Step 3: Assemble all scene clips into the full video
    const updatedVideo = await prisma.video.findUnique({
      where: { id: videoId },
      include: { scenes: { orderBy: { index: 'asc' } } },
    });

    if (!updatedVideo) {
      return NextResponse.json({ error: 'Video not found after scene renders' }, { status: 404 });
    }

    // Delete old assembled video again (in case it was recreated)
    if (updatedVideo.videoPath) {
      const oldPath = path.join(process.cwd(), 'public', updatedVideo.videoPath.replace(/^\//, ''));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    await prisma.video.update({ where: { id: videoId }, data: { videoPath: null } });

    const scenes = updatedVideo.scenes
      .filter(s => s.imagePath && s.audioPath)
      .map(scene => ({
        image: scene.imagePath!,
        audio: scene.audioPath!,
        narration: scene.narration || '',
      }));

    if (scenes.length === 0) {
      return NextResponse.json({ error: 'No scenes with assets to render' }, { status: 400 });
    }

    const assembleRes = await fetch(`${APP_URL}/api/render-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenes, isFullVideo: true }),
    });

    if (!assembleRes.ok) {
      return NextResponse.json({ error: 'Failed to trigger full video render' }, { status: 500 });
    }

    const { jobId } = await assembleRes.json();
    const result = await pollForCompletion(jobId);

    if (result.videoUrl) {
      await prisma.video.update({
        where: { id: videoId },
        data: { videoPath: result.videoUrl, generationStatus: 'ready' },
      });
      return NextResponse.json({ success: true, videoPath: result.videoUrl });
    }

    return NextResponse.json({ error: result.error || 'Full video render failed' }, { status: 500 });

  } catch (error: any) {
    console.error('[RenderFull] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
