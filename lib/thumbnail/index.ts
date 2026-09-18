import path from 'path';
import fs from 'fs';
import prisma from '@/lib/db';
import { THUMBNAIL_CONFIG_SHORT, THUMBNAIL_CONFIG_LONG } from './constants';
import { extractBestFrame, isFFmpegAvailable } from './extractFrame';
import { composeThumbnail } from './composeThumbnail';

type ThumbnailConfig = typeof THUMBNAIL_CONFIG_SHORT;

export interface GenerateThumbnailOptions {
  videoId: number;
  sceneIndex?: number; // Optional: specific scene index, or random if not provided
}

export interface GenerateThumbnailResult {
  success: boolean;
  thumbnailPath?: string;
  error?: string;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

function getVideoFolderPath(videoPath: string): string {
  return path.dirname(videoPath);
}

function getPublicPath(relativePath: string): string {
  return path.join(process.cwd(), 'public', relativePath.replace(/^\//, ''));
}

function getRelativePath(absolutePath: string): string {
  return absolutePath.replace(path.join(process.cwd(), 'public'), '');
}

export async function generateThumbnail(
  options: GenerateThumbnailOptions
): Promise<GenerateThumbnailResult> {
  const { videoId, sceneIndex } = options;
  
  try {
    const ffmpegAvailable = await isFFmpegAvailable();
    if (!ffmpegAvailable) {
      return {
        success: false,
        error: 'FFmpeg is not available on this system',
      };
    }
    
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: {
        topic: true,
        batch: true,
        scenes: {
          where: { imagePath: { not: null } },
          orderBy: { index: 'asc' },
        },
      },
    });
    
    console.log('[generateThumbnail] Video lookup result:', video ? `ID ${video.id}, title: ${video.title}, scenes: ${video.scenes.length}` : 'NOT FOUND');
    
    if (!video) {
      return {
        success: false,
        error: 'Video not found in database',
      };
    }
    
    // Detect if it's a long form video
    const isLongForm = video.batch?.contentMode === 'long_form';
    console.log('[generateThumbnail] Is long form:', isLongForm, 'contentMode:', video.batch?.contentMode);
    
    // Try to find the video file on disk (Windows renderer doesn't update DB)
    const topicFolderName = video.title.replace(/[^a-zA-Z0-9]/g, '_');
    const publicDir = path.join(process.cwd(), 'public', 'generations', topicFolderName);
    const outputDir = publicDir;
    
    let videoFullPath: string | null = null;
    
    // Check if videoPath exists in DB
    if (video.videoPath) {
      videoFullPath = getPublicPath(video.videoPath);
    } else {
      // Look for video file in topic folder
      const potentialVideoPath = path.join(publicDir, `${topicFolderName}.mp4`);
      console.log('[generateThumbnail] DB has no videoPath, checking:', potentialVideoPath);
      if (fs.existsSync(potentialVideoPath)) {
        videoFullPath = potentialVideoPath;
        console.log('[generateThumbnail] Found video file on disk!');
      }
    }
    
    if (!videoFullPath || !fs.existsSync(videoFullPath)) {
      return {
        success: false,
        error: 'No rendered video found. Please render the video first or place the .mp4 file in the topic folder.',
      };
    }
    
    if (video.scenes.length === 0 || !video.scenes[0].imagePath) {
      return {
        success: false,
        error: 'No scene images available. Generate scene images first.',
      };
    }
    
    const title = video.title;
    const sanitizedTitle = sanitizeFilename(title);
    
    // Select scene image - use provided index or random
    let selectedScene;
    if (sceneIndex !== undefined && sceneIndex >= 0 && sceneIndex < video.scenes.length) {
      selectedScene = video.scenes[sceneIndex];
    } else {
      // Random scene selection
      const randomIndex = Math.floor(Math.random() * video.scenes.length);
      selectedScene = video.scenes[randomIndex];
      console.log(`[generateThumbnail] Randomly selected scene index: ${randomIndex} (total: ${video.scenes.length})`);
    }
    
    const firstSceneImage = selectedScene.imagePath;
    if (!firstSceneImage) {
      return {
        success: false,
        error: 'Selected scene does not have an image',
      };
    }
    
    const baseImagePath = getPublicPath(firstSceneImage);
    
    if (!fs.existsSync(baseImagePath)) {
      return {
        success: false,
        error: `Scene image not found at: ${baseImagePath}`,
      };
    }
    const logoPath = path.join(process.cwd(), 'public', 'images/logos/logo.png');
    
    const finalOutputPath = path.join(outputDir, `${sanitizedTitle}.jpg`);
    
    const composeResult = await composeThumbnail({
      baseImagePath,
      outputPath: finalOutputPath,
      title,
      logoPath: fs.existsSync(logoPath) ? logoPath : undefined,
      isLongForm,
    });
    
    if (!composeResult.success) {
      return {
        success: false,
        error: composeResult.error || 'Failed to compose thumbnail',
      };
    }
    
    const thumbnailRelativePath = getRelativePath(finalOutputPath);
    
    await prisma.video.update({
      where: { id: videoId },
      data: { thumbnailPath: thumbnailRelativePath },
    });
    
    return {
      success: true,
      thumbnailPath: thumbnailRelativePath,
    };
    
  } catch (error) {
    console.error('[generateThumbnail] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error generating thumbnail',
    };
  }
}

export { THUMBNAIL_CONFIG } from './constants';
export { extractBestFrame, isFFmpegAvailable } from './extractFrame';
export { composeThumbnail } from './composeThumbnail';
export { calculateTextLayout, calculateTextPosition, calculateAccentLinePosition } from './layoutText';
