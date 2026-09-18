import { getAudioDurationInSeconds } from '@remotion/media-utils';
import path from 'path';

export async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const normalizedPath = audioPath.startsWith('/') 
      ? path.join(process.cwd(), 'public', audioPath.replace(/^\//, ''))
      : audioPath;
    
    const duration = await getAudioDurationInSeconds(`file://${normalizedPath}`);
    return duration;
  } catch (error) {
    console.error(`Error getting audio duration for ${audioPath}:`, error);
    return 5;
  }
}

export function secondsToFrames(seconds: number, fps: number = 30): number {
  return Math.ceil(seconds * fps);
}

export function framesToSeconds(frames: number, fps: number = 30): number {
  return frames / fps;
}
