import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

interface SceneInput {
  image: string;
  audio: string;
  narration?: string;
  sceneVideo?: string;
}

interface RenderRequest {
  scenes: SceneInput[];
  music?: string;
  isFullVideo?: boolean;
  title?: string;
}

interface JobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
  progress?: number;
}

// In-memory job storage (in production, use Redis or database)
const jobs = new Map<string, JobStatus>();

// Cleanup old jobs every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - (job.progress || 0) > 30 * 60 * 1000 && job.status !== 'processing') {
      jobs.delete(id);
    }
  }
}, 30 * 60 * 1000);

function generateJobId(): string {
  return `render-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export async function POST(request: NextRequest) {
  try {
    const body: RenderRequest = await request.json();
    
    if (!body.scenes || !Array.isArray(body.scenes) || body.scenes.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: scenes array is required and must not be empty' },
        { status: 400 }
      );
    }

    const firstScene = body.scenes[0];
    const firstImagePath = path.join(process.cwd(), 'public', firstScene.image.replace(/^\//, ''));
    const sceneDir = path.dirname(firstImagePath);
    const topicFolder = path.dirname(sceneDir);
    let topicName = path.basename(firstImagePath).replace('_image.png', '').replace('_image.jpg', '');
    
    // Handle scene_0 naming pattern (intro scene)
    topicName = topicName.replace(/^scene_\d+_/, '').replace(/\.png$/, '').replace(/\.jpg$/, '');
    
    let outputFilename: string;
    let outputPath: string;
    
    if (body.scenes.length === 1 && body.isFullVideo !== true) {
      const sceneFolderName = path.basename(sceneDir);
      const sceneMatch = sceneFolderName.match(/scene_(\d+)/i);
      const sceneNum = sceneMatch ? sceneMatch[1] : '1';
      outputFilename = `${topicName}_scene_${sceneNum}.mp4`;
      outputPath = path.join(sceneDir, outputFilename);
    } else {
      outputFilename = `${topicName}.mp4`;
      outputPath = path.join(topicFolder, outputFilename);
    }
    
    const jobId = generateJobId();
    
    // Initialize job status
    jobs.set(jobId, {
      id: jobId,
      status: 'pending',
      progress: Date.now(),
    });

    console.log(`Starting render job ${jobId}...`);

    const scenesJson = JSON.stringify(body.scenes);
    const renderScript = path.join(process.cwd(), 'scripts', 'render-bundle.ts');
    const titleArg = body.title ? JSON.stringify(body.title) : '';
    
    // Start render in background without waiting
    const renderProcess = spawn('npx', ['tsx', renderScript, scenesJson, outputPath, body.music || '', titleArg], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
      },
    });

    let renderError = '';
    let renderProcessFinished = false;
    let lastFileSize = 0;
    let stableCount = 0;
    
    // Capture stderr for error detection
    renderProcess.stderr?.on('data', (data) => {
      const msg = data.toString();
      renderError += msg;
      console.log(`[Render ${jobId}] ${msg}`);
    });
    
    renderProcess.on('error', (error) => {
      console.error(`[Render ${jobId}] Process error:`, error);
      jobs.set(jobId, {
        id: jobId,
        status: 'failed',
        error: `Render process failed to start: ${error.message}`,
        progress: Date.now(),
      });
    });
    
    renderProcess.on('close', (code) => {
      renderProcessFinished = true;
      console.log(`[Render ${jobId}] Process exited with code ${code}`);
      
      // If process finished but file doesn't exist or is too small, mark as failed
      if (code !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
        jobs.set(jobId, {
          id: jobId,
          status: 'failed',
          error: `Render process exited with code ${code}. ${renderError.substring(0, 500)}`,
          progress: Date.now(),
        });
      }
      // If successful, the interval will handle marking as completed after file is stable
    });
    
    // Update job status to processing
    jobs.set(jobId, {
      id: jobId,
      status: 'processing',
      progress: Date.now(),
    });

    // Monitor the render process - wait for file to be stable (not growing)
    const checkInterval = setInterval(() => {
      const job = jobs.get(jobId);
      if (!job) {
        clearInterval(checkInterval);
        return;
      }

      // Check if file exists and is still being written
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        
        // If file size hasn't changed in 2 consecutive checks, it's likely done
        if (stats.size === lastFileSize && stats.size > 1000) {
          stableCount++;
        } else {
          stableCount = 0;
        }
        
        lastFileSize = stats.size;
        
        // File needs to be stable for 10 seconds (2 consecutive checks at 5s interval)
        // AND the render process must have finished
        if (stableCount >= 2 && renderProcessFinished) {
          clearInterval(checkInterval);
          const videoUrl = outputPath.replace(path.join(process.cwd(), 'public'), '');
          jobs.set(jobId, {
            id: jobId,
            status: 'completed',
            videoUrl,
            progress: Date.now(),
          });
          console.log(`Job ${jobId} completed: ${videoUrl} (file stable)`);
        }
      }
      
      // Timeout after 30 minutes - mark as failed if not completed
      const jobStartTime = job.progress || Date.now();
      if (Date.now() - jobStartTime > 30 * 60 * 1000 && job.status === 'processing') {
        clearInterval(checkInterval);
        jobs.set(jobId, {
          id: jobId,
          status: 'failed',
          error: 'Render timeout after 30 minutes',
          progress: Date.now(),
        });
      }
    }, 5000);

    // Return immediately with job ID
    return NextResponse.json({
      success: true,
      jobId,
      status: 'processing',
      message: 'Render started',
    });

  } catch (error) {
    console.error('Error rendering video:', error);
    return NextResponse.json(
      { error: 'Failed to render video', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId');
  
  if (!jobId) {
    return NextResponse.json({
      message: 'Video render API',
      usage: 'POST with { scenes: [{ image, audio, narration? }], music?: string }, GET with ?jobId=<id> to check status',
    });
  }

  const job = jobs.get(jobId);
  
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json(job);
}
