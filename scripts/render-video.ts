import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { VIDEO_CONFIG } from '@/remotion/types';
import { buildTimeline, RawSceneInput, TimelineScene } from '@/remotion/utils/timeline';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'videos');
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const REMOTION_ENTRY = path.join(process.cwd(), 'remotion', 'index.ts');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function startStaticServer(port: number): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(PUBLIC_DIR, req.url?.replace(/^\//, '') || '');
      
      const range = req.headers.range;
      if (range && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const parts = range.match(/bytes=(\d+)-(\d*)/);
        const start = parts ? parseInt(parts[1], 10) : 0;
        const end = parts && parts[2] ? parseInt(parts[2], 10) : fileSize - 1;
        
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Type': getMimeType(filePath),
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(port, () => {
      resolve({ server, baseUrl: `http://localhost:${port}` });
    });
  });
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

async function main() {
  // Use existing scenes
  const basePath = '/generations/The_Shocking_Truth_About_Self_Motivation_They_Don_t_Want_You_to_Know';
  
  const scenes = [1, 2, 3, 4, 5, 6].map(sceneNum => ({
    image: `${basePath}/scene_${sceneNum}/The_Shocking_Truth_About_Self_Motivation_They_Don_t_Want_You_to_Know_image.png`,
    audio: `${basePath}/scene_${sceneNum}/The_Shocking_Truth_About_Self_Motivation_They_Don_t_Want_You_to_Know_scene_${sceneNum}.mp3`,
    narration: undefined,
  }));

  const outputFilename = 'test_output.mp4';
  const outputPath = path.join(OUTPUT_DIR, outputFilename);

  console.log('Starting static server...');
  const { server, baseUrl } = await startStaticServer(3456);

  try {
    console.log('========================================');
    console.log('BUILDING TIMELINE');
    console.log('========================================');

    const rawScenes: RawSceneInput[] = scenes.map((scene, index) => ({
      id: `scene-${index + 1}`,
      imageSrc: `${baseUrl}${scene.image}`,
      audioSrc: `${baseUrl}${scene.audio}`,
      narration: scene.narration,
    }));

    const timeline = await buildTimeline(rawScenes, VIDEO_CONFIG.fps);

    const timelineSceneData = timeline.scenes.map((scene: TimelineScene) => ({
      id: scene.id,
      imageSrc: scene.imageSrc,
      audioSrc: scene.audioSrc,
      narration: scene.narration,
      startFrame: scene.startFrame,
      durationInFrames: scene.durationInFrames,
      endFrame: scene.endFrame,
      sceneIndex: scene.sceneIndex,
      transitionOverlap: scene.transitionOverlap,
      animationType: scene.animationType,
      speedAnalysis: scene.speedAnalysis,
    }));

    console.log(`Total duration: ${timeline.totalDurationInFrames} frames (${timeline.totalDurationInSeconds.toFixed(2)}s)`);

    const renderProps = {
      scenes: timelineSceneData,
      musicSrc: undefined,
      outputFilename,
      totalDurationInFrames: timeline.totalDurationInFrames,
      narrationPositionBottom: '15%',
    };

    console.log('Bundling Remotion project...');
    const bundleLocation = await bundle(
      REMOTION_ENTRY,
      (progress) => console.log(`Bundling: ${Math.round(progress * 100)}%`),
      { outDir: path.join(process.cwd(), '.remotion', 'bundles') }
    );

    console.log('Selecting composition...');
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'Video',
      inputProps: renderProps,
    });

    console.log('Starting render...');
    
    // Calculate timeout: 2x video duration + 5 min buffer
    const renderTimeout = Math.max(timeline.totalDurationInSeconds * 2 * 1000 + 300000, 600000);
    console.log(`Render timeout set to: ${(renderTimeout / 60000).toFixed(1)} minutes`);
    
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: renderProps,
      pixelFormat: 'yuv420p',
      crf: 23,
    });

    console.log(`Render complete: ${outputPath}`);
  } finally {
    server.close();
  }
}

main().catch(console.error);
