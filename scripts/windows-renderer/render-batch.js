/**
 * Windows Batch Video Renderer
 * 
 * This script processes multiple video JSON files sequentially
 * Usage: node render-batch.js [batch-list.json]
 * 
 * If no batch-list.json provided, it will look for /public/batch-render-list.json
 */

const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

const VIDEO_CONFIG = {
  fps: 30,
  width: 1080,
  height: 1920,
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function getAudioDuration(filePath) {
  try {
    const output = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, {
      encoding: 'utf-8',
      timeout: 10000
    });
    const duration = parseFloat(output.trim());
    if (!isNaN(duration) && duration > 0) {
      return duration;
    }
  } catch (e) {
    console.log('ffprobe failed, using default duration');
  }
  return 5;
}

async function startStaticServer(wsulMountPath, port = 3459) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url?.replace(/^\//, '') || '';
      let filePath = path.join(wsulMountPath, urlPath);
      
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found: ' + filePath);
      }
    });
    
    server.listen(port, () => resolve({ server, baseUrl: `http://localhost:${port}` }));
    server.on('error', reject);
  });
}

function getRandomMusicFile(publicPath) {
  const musicFolder = path.join(publicPath, 'audio', 'music');
  
  if (!fs.existsSync(musicFolder)) {
    console.log('Music folder not found, skipping background music');
    return null;
  }
  
  const files = fs.readdirSync(musicFolder);
  const audioFiles = files.filter(file => 
    /\.(mp3|wav|ogg|m4a|webm)$/i.test(file)
  );
  
  if (audioFiles.length === 0) {
    console.log('No music files found, skipping background music');
    return null;
  }
  
  const randomIndex = Math.floor(Math.random() * audioFiles.length);
  const selectedFile = audioFiles[randomIndex];
  
  console.log(`Selected background music: ${selectedFile}`);
  return `/audio/music/${selectedFile}`;
}

async function renderSingleVideo(jsonFilePath, server, baseUrl, publicPath) {
  const videoStartTime = Date.now();
  
  if (!fs.existsSync(jsonFilePath)) {
    throw new Error(`JSON file not found: ${jsonFilePath}`);
  }

  const data = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
  const { title, scenes, outputPath } = data;

  console.log('\n===========================================');
  console.log(`Rendering: ${title}`);
  console.log(`Scenes: ${scenes.length}`);
  console.log('===========================================\n');

  // Get actual audio durations for each scene
  const scenesWithTiming = scenes.map((scene, index) => {
    const audioPathLocal = publicPath + scene.audio.replace(/\//g, '\\');
    const audioDuration = getAudioDuration(audioPathLocal);
    
    console.log(`  Scene ${index}: ${audioDuration.toFixed(1)}s`);
    
    return {
      ...scene,
      audioDuration,
      durationInSeconds: audioDuration,
    };
  });

  const totalDurationSeconds = scenesWithTiming.reduce((sum, s) => sum + s.durationInSeconds, 0);
  console.log(`\nTotal video duration: ${totalDurationSeconds.toFixed(1)}s\n`);

  const timelineScenes = [];
  let currentFrame = 0;
  const fps = VIDEO_CONFIG.fps;

  for (let i = 0; i < scenesWithTiming.length; i++) {
    const scene = scenesWithTiming[i];
    
    const durationInSeconds = scene.durationInSeconds;
    const durationInFrames = Math.round(durationInSeconds * fps);
    const transitionOverlap = Math.round(0.5 * fps);
    
    const startFrame = currentFrame;
    const endFrame = startFrame + durationInFrames;

    // Wipe directions for soft-wipe (cycles: right, left, up, down)
    const wipeDirections = ['right', 'left', 'up', 'down'];
    const wipeDirection = i === 0 ? 'right' : wipeDirections[(i - 1) % wipeDirections.length];

    timelineScenes.push({
      id: `scene-${scene.index}`,
      imageSrc: `${baseUrl}${scene.image}`,
      audioSrc: `${baseUrl}${scene.audio}`,
      narration: scene.narration,
      durationInFrames,
      endFrame,
      sceneIndex: i,
      startFrame,
      transitionOverlap,
      animationType: i === 0 ? 'none' : ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'ken-burns', 'spiral-zoom', 'pulse-breathe', 'drift-diagonal', 'focus-pull', 'orbit-light', 'slow-scale-rotate', 'parallax-layer', 'subtle-float', 'cinematic-push'][i % 16],
      wipeDirection,
    });

    currentFrame = endFrame;
  }

  const totalDurationInFrames = currentFrame;

  // Get random background music
  const musicFile = getRandomMusicFile(publicPath);
  const musicSrc = musicFile ? `${baseUrl}${musicFile}` : undefined;

  const renderProps = {
    scenes: timelineScenes,
    musicSrc,
    outputFilename: path.basename(outputPath),
    totalDurationInFrames,
    title,
    baseUrl,
  };

  const remotionEntry = path.join(__dirname, 'remotion', 'index.ts');
  const remotionDir = __dirname;

  // Check if bundle already exists
  const bundleLocation = await bundle(
    remotionEntry,
    (progress) => process.stdout.write(`\rBundling: ${Math.round(progress * 100)}%`),
    { 
      outDir: path.join(remotionDir, '.remotion', 'bundles'),
      webpackOverride: (config) => config 
    }
  );
  console.log('');

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: 'Video',
    inputProps: renderProps,
  });

  const renderStartTime = Date.now();
  
  const finalOutputPath = outputPath.startsWith('/') 
    ? (publicPath + outputPath.replace(/\//g, '\\'))
    : path.join(publicPath, outputPath);

  // Ensure output directory exists
  const outputDir = path.dirname(finalOutputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: finalOutputPath,
    inputProps: renderProps,
    pixelFormat: 'yuv420p',
    crf: 23,
    hardwareAcceleration: 'if-possible',
  });

  const renderTime = Date.now() - renderStartTime;
  const totalTime = Date.now() - videoStartTime;
  
  console.log('\n-------------------------------------------');
  console.log(`Video complete: ${path.basename(finalOutputPath)}`);
  console.log(`Render time: ${(renderTime / 60000).toFixed(1)} minutes`);
  console.log(`Total time: ${(totalTime / 60000).toFixed(1)} minutes`);
  console.log('-------------------------------------------\n');
  
  return { 
    success: true, 
    outputPath: finalOutputPath, 
    renderTime, 
    totalTime,
    title 
  };
}

async function renderBatch(batchListPath) {
  const startTime = Date.now();
  
  console.log('===========================================');
  console.log('Windows Batch Video Renderer');
  console.log('===========================================\n');
  
  if (!fs.existsSync(batchListPath)) {
    throw new Error(`Batch list not found: ${batchListPath}`);
  }

  const batchData = JSON.parse(fs.readFileSync(batchListPath, 'utf-8'));
  const { videos, totalVideos } = batchData;

  console.log(`Found ${totalVideos} videos to render\n`);

  const baseWSLPath = '\\\\wsl$\\Ubuntu\\home\\nadim\\ytautomation\\public';
  const publicPath = baseWSLPath;

  const { server, baseUrl } = await startStaticServer(publicPath);

  const results = {
    successful: [],
    failed: []
  };

  try {
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      
      console.log(`\n[${i + 1}/${videos.length}] Starting render...`);
      
      try {
        const result = await renderSingleVideo(video.jsonPath, server, baseUrl, publicPath);
        results.successful.push({ ...result, jsonPath: video.jsonPath });
      } catch (error) {
        console.error(`Failed to render ${video.title}:`, error.message);
        results.failed.push({ 
          title: video.title, 
          jsonPath: video.jsonPath,
          error: error.message 
        });
      }
      
      // Small delay between videos
      if (i < videos.length - 1) {
        console.log('Waiting 5 seconds before next video...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    const totalTime = Date.now() - startTime;
    
    console.log('\n===========================================');
    console.log('BATCH RENDER COMPLETE');
    console.log('===========================================');
    console.log(`Total videos: ${videos.length}`);
    console.log(`Successful: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log(`Total time: ${(totalTime / 60000).toFixed(1)} minutes`);
    console.log('===========================================\n');

    // Save results
    const resultsPath = path.join(__dirname, 'batch-render-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify({
      completedAt: new Date().toISOString(),
      totalVideos: videos.length,
      successful: results.successful.length,
      failed: results.failed.length,
      results
    }, null, 2));
    console.log(`Results saved to: ${resultsPath}`);
    
  } catch (err) {
    console.error('Batch render error:', err.message);
    throw err;
  } finally {
    if (server) server.close();
  }
}

// Main
const args = process.argv.slice(2);
const batchListPath = args[0] || '\\\\wsl$\\Ubuntu\\home\\nadim\\ytautomation\\public\\batch-render-list.json';

renderBatch(batchListPath)
  .then(() => {
    console.log('\nAll done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\nBatch render failed:', err.message);
    process.exit(1);
  });
