/**
 * Pipeline Action Executor
 * Runs the actual work when a video advances through stages.
 * Each action is idempotent — can be retried without duplicating work.
 */
import { prisma } from '@/lib/db';
import path from 'path';
import fs from 'fs';
import { generateImage } from '@/lib/imageService';
import { generateNarrationAudio, measureAudioDuration } from '@/lib/tts';

type PipelineStage = string;

const GENERATIONS_DIR = path.join(process.cwd(), 'public', 'generations');

export interface StageActionResult {
  success: boolean;
  stage: PipelineStage;
  message: string;
  error?: string;
}

/**
 * Execute the pipeline action for advancing a video to the target stage.
 * Called when a video card moves from one column to the next.
 */
export async function executeStageAction(
  videoId: number,
  targetStage: PipelineStage
): Promise<StageActionResult> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { scenes: { orderBy: { index: 'asc' } } },
  });

  if (!video) return { success: false, stage: targetStage, message: '', error: 'Video not found' };

  switch (targetStage) {
    case 'script':
      return executeScriptGeneration(videoId, video);
    case 'images':
      return executeImageGeneration(videoId, video);
    case 'voiceover':
      return executeVoiceoverGeneration(videoId, video);
    case 'render':
      return executeRender(videoId, video);
    case 'review':
      return { success: true, stage: 'review', message: 'Ready for review' };
    case 'uploaded':
      return { success: true, stage: 'uploaded', message: 'Uploaded to YouTube' };
    default:
      return { success: true, stage: targetStage, message: 'No action needed' };
  }
}

/**
 * Generate script: use OpenRouter LLM to create narration + scenes
 */
async function executeScriptGeneration(videoId: number, video: any): Promise<StageActionResult> {
  try {
    // Check if already generated
    if (video.narration && video.scenes.length > 0) {
      return { success: true, stage: 'script', message: 'Script already exists' };
    }

    const config = (video.batch?.configJson as any) || {};
    const aspectRatio = config.aspectRatio || 'portrait';
    const isLongForm = video.batch?.contentMode === 'long_form';
    const sceneMin = isLongForm ? 6 : 4;
    const sceneMax = isLongForm ? 12 : 8;

    const systemPrompt = `You are a YouTube script writer. Generate a ${isLongForm ? 'long-form' : 'short'} video script.
Return ONLY valid JSON:
{
  "title": "video title",
  "narration": "full narration text",
  "scenes": [
    {"narration": "scene 1 text", "prompt": "image generation prompt for scene 1"},
    ...
  ]
}
Each scene narration should be ${sceneMin}-${sceneMax} seconds when spoken.
Generate 4-6 scenes for shorts, 6-10 for long-form.
Image prompts should be descriptive, cinematic, photorealistic.`;

    const userPrompt = `Topic: ${video.title}
Create a ${isLongForm ? 'long-form' : 'YouTube Shorts'} script.
Aspect ratio: ${aspectRatio === 'portrait' ? '9:16 vertical' : '16:9 horizontal'}.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'nousresearch/hermes-4-405b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);

    // Update video with narration
    await prisma.video.update({
      where: { id: videoId },
      data: { narration: content.narration, title: content.title || video.title },
    });

    // Delete existing scenes and create new ones
    await prisma.scene.deleteMany({ where: { videoId } });

    for (let i = 0; i < content.scenes.length; i++) {
      await prisma.scene.create({
        data: {
          videoId,
          index: i,
          narration: content.scenes[i].narration,
          prompt: content.scenes[i].prompt,
        },
      });
    }

    return {
      success: true,
      stage: 'script',
      message: `Generated ${content.scenes.length} scenes`,
    };
  } catch (error: any) {
    return { success: false, stage: 'script', message: '', error: error.message };
  }
}

/**
 * Generate images for each scene using Pollinations
 */
async function executeImageGeneration(videoId: number, video: any): Promise<StageActionResult> {
  try {
    const scenes = video.scenes.filter((s: any) => !s.imagePath);

    if (scenes.length === 0) {
      return { success: true, stage: 'images', message: 'All images already generated' };
    }

    const config = (video.batch?.configJson as any) || {};
    const aspectRatio = config.aspectRatio === 'landscape' ? '16:9' : '9:16';

    for (const scene of scenes) {
      try {
        const safeTitle = video.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
        const sceneDir = path.join(GENERATIONS_DIR, safeTitle, `scene_${scene.index}`);
        fs.mkdirSync(sceneDir, { recursive: true });

        const result = await generateImage(scene.prompt, aspectRatio);

        if (result.base64) {
          const imagePath = `/${safeTitle}_image.png`;
          const fullPath = path.join(sceneDir, imagePath.replace(/^\//, ''));
          fs.writeFileSync(fullPath, Buffer.from(result.base64, 'base64'));

          await prisma.scene.update({
            where: { id: scene.id },
            data: {
              imagePath: `/generations/${safeTitle}/scene_${scene.index}${imagePath}`,
            },
          });
        }
      } catch (e: any) {
        console.error(`Failed to generate image for scene ${scene.index}:`, e.message);
      }
    }

    return { success: true, stage: 'images', message: `Generated images for ${scenes.length} scenes` };
  } catch (error: any) {
    return { success: false, stage: 'images', message: '', error: error.message };
  }
}

/**
 * Generate voiceover for each scene using Azure TTS
 */
async function executeVoiceoverGeneration(videoId: number, video: any): Promise<StageActionResult> {
  try {
    const scenes = video.scenes.filter((s: any) => !s.audioPath);

    if (scenes.length === 0) {
      return { success: true, stage: 'voiceover', message: 'All audio already generated' };
    }

    for (const scene of scenes) {
      try {
        const safeTitle = video.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
        const sceneDir = path.join(GENERATIONS_DIR, safeTitle, `scene_${scene.index}`);
        fs.mkdirSync(sceneDir, { recursive: true });

        const audioFilename = `${safeTitle}_scene_${scene.index}.mp3`;
        const audioPath = path.join(sceneDir, audioFilename);

        const finalPath = await generateNarrationAudio(scene.narration, audioPath);

        // Measure actual audio duration in ms
        const audioDurationMs = await measureAudioDuration(finalPath);

        await prisma.scene.update({
          where: { id: scene.id },
          data: {
            audioPath: `/generations/${safeTitle}/scene_${scene.index}/${path.basename(finalPath)}`,
            audioDurationMs,
          },
        });
      } catch (e: any) {
        console.error(`Failed to generate audio for scene ${scene.index}:`, e.message);
      }
    }

    return {
      success: true,
      stage: 'voiceover',
      message: `Generated audio for ${scenes.length} scenes`,
    };
  } catch (error: any) {
    return { success: false, stage: 'voiceover', message: '', error: error.message };
  }
}

/**
 * Render video using Remotion
 */
async function executeRender(videoId: number, video: any): Promise<StageActionResult> {
  try {
    if (video.videoPath && fs.existsSync(path.join(process.cwd(), 'public', video.videoPath.replace(/^\//, '')))) {
      return { success: true, stage: 'render', message: 'Video already rendered' };
    }

    const scenes = video.scenes.filter((s: any) => s.imagePath && s.audioPath);

    if (scenes.length === 0) {
      return { success: false, stage: 'render', message: '', error: 'No scenes with both image and audio' };
    }

    const safeTitle = video.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);

    // Call the render API with actual audio durations
    const renderBody = {
      scenes: scenes.map((s: any) => ({
        image: s.imagePath,
        audio: s.audioPath,
        narration: s.narration,
        durationMs: s.audioDurationMs || 8000, // fallback 8s if not measured
      })),
      title: video.title,
    };

    const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
    const response = await fetch(`${baseUrl}/api/render-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(renderBody),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Render API error: ${err}`);
    }

    const result = await response.json();

    // Poll for completion
    if (result.jobId) {
      const videoPath = await pollRenderCompletion(result.jobId, videoId);
      return { success: true, stage: 'render', message: `Rendered: ${videoPath}` };
    }

    return { success: true, stage: 'render', message: 'Render started' };
  } catch (error: any) {
    return { success: false, stage: 'render', message: '', error: error.message };
  }
}

async function pollRenderCompletion(jobId: string, videoId: number): Promise<string> {
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  const maxPolls = 120; // 10 minutes max
  let polls = 0;

  while (polls < maxPolls) {
    const res = await fetch(`${baseUrl}/api/render-video?jobId=${jobId}`);
    const data = await res.json();

    if (data.status === 'completed' && data.videoUrl) {
      await prisma.video.update({
        where: { id: videoId },
        data: { videoPath: data.videoUrl },
      });
      return data.videoUrl;
    }

    if (data.status === 'failed') {
      throw new Error(data.error || 'Render failed');
    }

    await new Promise((r) => setTimeout(r, 5000));
    polls++;
  }

  throw new Error('Render timeout');
}
