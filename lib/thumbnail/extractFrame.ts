import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { THUMBNAIL_CONFIG } from './constants';

export interface ExtractFrameOptions {
  videoPath: string;
  outputDir: string;
  title: string;
}

export interface ExtractFrameResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

export async function extractBestFrame(
  options: ExtractFrameOptions
): Promise<ExtractFrameResult> {
  const { videoPath, outputDir, title } = options;
  
  if (!fs.existsSync(videoPath)) {
    return {
      success: false,
      error: `Video file not found: ${videoPath}`,
    };
  }
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const tempOutputPath = path.join(outputDir, THUMBNAIL_CONFIG.TEMP_FILENAME);
  
  return new Promise((resolve) => {
    const args = [
      '-i', videoPath,
      '-vf', `thumbnail,scale=${THUMBNAIL_CONFIG.CANVAS_WIDTH}:${THUMBNAIL_CONFIG.CANVAS_HEIGHT}`,
      '-frames:v', '1',
      '-q:v', '2',
      '-y',
      tempOutputPath,
    ];
    
    console.log(`[extractFrame] Running FFmpeg: ffmpeg ${args.join(' ')}`);
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    let stderr = '';
    
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        console.error(`[extractFrame] FFmpeg error: ${stderr}`);
        resolve({
          success: false,
          error: `FFmpeg exited with code ${code}: ${stderr.substring(0, 500)}`,
        });
        return;
      }
      
      if (!fs.existsSync(tempOutputPath)) {
        resolve({
          success: false,
          error: 'Frame was not extracted - output file not found',
        });
        return;
      }

      resolve({
        success: true,
        outputPath: tempOutputPath,
      });
    });
    
    ffmpeg.on('error', (err) => {
      console.error(`[extractFrame] FFmpeg spawn error: ${err.message}`);
      resolve({
        success: false,
        error: `Failed to start FFmpeg: ${err.message}`,
      });
    });
  });
}

export function isFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    ffmpeg.on('close', (code) => {
      resolve(code === 0);
    });
    
    ffmpeg.on('error', () => {
      resolve(false);
    });
  });
}
