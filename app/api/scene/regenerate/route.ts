import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateImage } from '@/lib/imageService';
import { generateNarrationAudio } from '@/lib/tts';
import path from 'path';
import fs from 'fs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function pollForCompletion(jobId: string, timeoutMs = 600000): Promise<{ videoUrl?: string; error?: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000));
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

async function triggerSceneRender(sceneId: number, imagePath: string, audioPath: string, narration: string): Promise<string | null> {
  // Delete old clip if exists
  const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
  if (scene?.sceneVideoPath) {
    const oldPath = path.join(process.cwd(), 'public', scene.sceneVideoPath.replace(/^\//, ''));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const jobRes = await fetch(`${APP_URL}/api/render-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenes: [{ image: imagePath, audio: audioPath, narration }] }),
  });
  if (!jobRes.ok) return null;
  const { jobId } = await jobRes.json();

  const result = await pollForCompletion(jobId);
  if (result.videoUrl) {
    await prisma.scene.update({ where: { id: sceneId }, data: { sceneVideoPath: result.videoUrl } });

    // Also re-assemble the full video with the updated scene assets
    await triggerFullVideoRender(scene!.videoId);

    return result.videoUrl;
  }
  return null;
}

async function triggerFullVideoRender(videoId: number): Promise<void> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      topic: true,
      scenes: { orderBy: { index: 'asc' } },
    },
  });
  if (!video) return;

  const scenesWithAssets = video.scenes.filter(s => s.imagePath && s.audioPath);
  if (scenesWithAssets.length !== video.scenes.length) return; // not all ready

  // Delete old full video
  if (video.videoPath) {
    const oldPath = path.join(process.cwd(), 'public', video.videoPath.replace(/^\//, ''));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  await prisma.video.update({ where: { id: videoId }, data: { videoPath: null } });

  // Re-render full video
  const scenes = scenesWithAssets.map(scene => ({
    image: scene.imagePath!,
    audio: scene.audioPath!,
    narration: scene.narration || '',
  }));

  const assembleRes = await fetch(`${APP_URL}/api/render-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenes, isFullVideo: true }),
  });
  if (!assembleRes.ok) return;
  const { jobId } = await assembleRes.json();

  const result = await pollForCompletion(jobId);
  if (result.videoUrl) {
    await prisma.video.update({ where: { id: videoId }, data: { videoPath: result.videoUrl } });
  }
}

const GENERATIONS_DIR = path.join(process.cwd(), 'public', 'generations');

async function regenerateText(scene: any, field: 'prompt' | 'narration'): Promise<string> {
  const video = await prisma.video.findUnique({
    where: { id: scene.videoId },
    include: { topic: true, scenes: { orderBy: { index: 'asc' } } },
  });
  if (!video) throw new Error('Video not found');

  const otherScenes = video.scenes
    .filter((s: any) => s.id !== scene.id)
    .map((s: any) => ({ index: s.index, narration: s.narration, prompt: s.prompt }));

  const fieldPrompt = field === 'prompt'
    ? `Generate a NEW cinematic image prompt for scene ${scene.index} (index ${scene.index}) of "${video.title}".
The narration for this scene is: "${scene.narration}"
Context — other scenes in this video:
${otherScenes.map((s: any) => `Scene ${s.index}: "${s.narration.substring(0, 80)}"`).join('\n')}
Return ONLY the new image prompt as plain text. Make it descriptive, photorealistic, and cinematic. No quotes, no JSON.`
    : `Rewrite the narration for scene ${scene.index} of "${video.title}".
Current narration: "${scene.narration}"
Context — other scenes:
${otherScenes.map((s: any) => `Scene ${s.index}: "${s.narration}"`).join('\n')}
Return ONLY the rewritten narration as plain text. Keep similar length. No quotes, no JSON.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'nousresearch/hermes-4-405b',
      messages: [
        { role: 'system', content: 'You are a creative video script writer. Return ONLY the requested text, no markdown, no quotes, no JSON wrapper.' },
        { role: 'user', content: fieldPrompt },
      ],
      temperature: 0.8,
      max_tokens: 500,
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter API error: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sceneId, type } = body;

    if (!sceneId || !type) {
      return NextResponse.json({ error: 'sceneId and type are required' }, { status: 400 });
    }

    if (!['image', 'audio', 'prompt', 'narration'].includes(type)) {
      return NextResponse.json({ error: 'type must be image, audio, prompt, or narration' }, { status: 400 });
    }

    const scene = await prisma.scene.findUnique({
      where: { id: sceneId },
      include: { video: { include: { batch: true } } },
    });

    if (!scene) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
    }

    const video = scene.video;
    const safeTitle = video.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const sceneDir = path.join(GENERATIONS_DIR, safeTitle, `scene_${scene.index}`);
    fs.mkdirSync(sceneDir, { recursive: true });

    const config = (video.batch?.configJson as any) || {};
    const aspectRatio = config.aspectRatio === 'landscape' ? '16:9' : '9:16';

    const result: any = { sceneId, type, success: true };

    switch (type) {
      case 'image': {
        console.log(`[Regen] Generating image for scene ${sceneId}`);
        const imgResult = await generateImage(scene.prompt, aspectRatio);
        if (imgResult.base64) {
          const imgFilename = `${safeTitle}_image.png`;
          const fullPath = path.join(sceneDir, imgFilename);
          fs.writeFileSync(fullPath, Buffer.from(imgResult.base64, 'base64'));
          const imagePath = `/generations/${safeTitle}/scene_${scene.index}/${imgFilename}`;
          await prisma.scene.update({ where: { id: sceneId }, data: { imagePath } });
          result.imagePath = imagePath;
          // Re-render the scene clip with the new image
          if (scene.audioPath) {
            const updatedScene = await prisma.scene.findUnique({ where: { id: sceneId } });
            if (updatedScene) {
              await triggerSceneRender(sceneId, updatedScene.imagePath!, updatedScene.audioPath!, updatedScene.narration || '');
            }
          }
        }
        break;
      }

      case 'audio': {
        console.log(`[Regen] Generating audio for scene ${sceneId}`);
        const audioFilename = `${safeTitle}_scene_${scene.index}.mp3`;
        const audioPath = path.join(sceneDir, audioFilename);
        const finalPath = await generateNarrationAudio(scene.narration, audioPath);
        const relPath = `/generations/${safeTitle}/scene_${scene.index}/${path.basename(finalPath)}`;
        await prisma.scene.update({ where: { id: sceneId }, data: { audioPath: relPath } });
        result.audioPath = relPath;
        // Re-render the scene clip with the new audio
        if (scene.imagePath) {
          const updatedScene = await prisma.scene.findUnique({ where: { id: sceneId } });
          if (updatedScene) {
            await triggerSceneRender(sceneId, updatedScene.imagePath!, updatedScene.audioPath!, updatedScene.narration || '');
          }
        }
        break;
      }

      case 'prompt': {
        console.log(`[Regen] LLM regenerating prompt for scene ${sceneId}`);
        const newPrompt = await regenerateText(scene, 'prompt');
        await prisma.scene.update({ where: { id: sceneId }, data: { prompt: newPrompt } });
        result.prompt = newPrompt;
        break;
      }

      case 'narration': {
        console.log(`[Regen] LLM regenerating narration for scene ${sceneId}`);
        const newNarration = await regenerateText(scene, 'narration');
        await prisma.scene.update({ where: { id: sceneId }, data: { narration: newNarration } });
        result.narration = newNarration;
        break;
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Regen] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
