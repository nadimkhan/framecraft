/**
 * Windows GPU Video Renderer - Long Form (16:9)
 * 
 * Prerequisites:
 * 1. Install Node.js: https://nodejs.org/
 * 2. Install FFmpeg with GPU support
 * 3. Run: npm install
 * 
 * Usage:
 *   node render-gpu-longform.js <path-to-json-file>
 * 
 * Example:
 *   node render-gpu-longform.js "\\wsl$\Ubuntu\home\nadim\ytautomation\public\generations\TopicName\Topic_scenes_longform.json"
 */

const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

const VIDEO_CONFIG = {
  fps: 30,
  width: 1920,
  height: 1080,
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

async function startStaticServer(wsulMountPath, port = 3460) {
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

async function renderLongFormWithGPU(jsonFilePath) {
  const startTime = Date.now();
  
  if (!fs.existsSync(jsonFilePath)) {
    throw new Error(`JSON file not found: ${jsonFilePath}`);
  }

  const data = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
  const { title, scenes, outputPath } = data;

  console.log('===========================================');
  console.log('Windows GPU Video Renderer - Long Form (16:9)');
  console.log('===========================================');
  console.log(`Title: ${title}`);
  console.log(`Scenes: ${scenes.length}`);
  console.log(`Resolution: ${VIDEO_CONFIG.width}x${VIDEO_CONFIG.height}`);
  console.log('');

  const baseWSLPath = '\\\\wsl$\\Ubuntu\\home\\nadim\\ytautomation\\public';
  const publicPath = baseWSLPath;

  // Get actual audio durations for each scene
  const scenesWithTiming = scenes.map((scene, index) => {
    const audioPathLocal = publicPath + scene.audio.replace(/\//g, '\\');
    const audioDuration = getAudioDuration(audioPathLocal);
    
    console.log(`  Scene ${index + 1}: ${audioDuration.toFixed(1)}s`);
    
    return {
      ...scene,
      audioDuration,
      durationInSeconds: audioDuration,
    };
  });

  const totalDurationSeconds = scenesWithTiming.reduce((sum, s) => sum + s.durationInSeconds, 0);
  console.log('');
  console.log(`Total video duration: ${totalDurationSeconds.toFixed(1)}s`);
  console.log('Starting render...');

  const { server, baseUrl } = await startStaticServer(publicPath);

  try {
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

      // Wipe directions for soft-wipe
      const wipeDirections = ['right', 'left', 'up', 'down'];
      const wipeDirection = wipeDirections[i % wipeDirections.length];

      // Simple, subtle animations for long form
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
        animationType: ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'ken-burns', 'slow-scale-rotate'][i % 6],
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
      width: VIDEO_CONFIG.width,
      height: VIDEO_CONFIG.height,
      narrationPositionBottom: '10%',
    };

    const remotionEntry = path.join(__dirname, 'remotion', 'index.ts');
    const remotionDir = __dirname;

    const bundleLocation = await bundle(
      remotionEntry,
      (progress) => process.stdout.write(`\rBundling: ${Math.round(progress * 100)}%`),
      { 
        outDir: path.join(remotionDir, '.remotion', 'bundles-longform'),
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

    // Set custom temp directory
    const tempDir = path.join(publicPath, '.temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
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
      tempDir: tempDir,
    });

    const renderTime = Date.now() - renderStartTime;
    const totalTime = Date.now() - startTime;
    
    console.log('');
    console.log('===========================================');
    console.log(`Render complete: ${finalOutputPath}`);
    console.log(`Render time: ${(renderTime / 60000).toFixed(1)} minutes`);
    console.log(`Total time: ${(totalTime / 60000).toFixed(1)} minutes`);
    console.log('===========================================');
    
    return { success: true, outputPath: finalOutputPath, renderTime, totalTime };
    
  } catch (err) {
    console.error('Error:', err.message);
    throw err;
  } finally {
    if (server) server.close();
  }
}

const args = process.argv.slice(2);

if (args.length < 1) {
  console.log('Windows GPU Video Renderer - Long Form (16:9)');
  console.log('==============================================');
  console.log('');
  console.log('Usage: node render-gpu-longform.js <path-to-json-file>');
  console.log('');
  console.log('Example:');
  console.log('  node render-gpu-longform.js "\\\\wsl$\\Ubuntu\\home\\nadim\\ytautomation\\public\\generations\\TopicName\\Topic_scenes_longform.json"');
  console.log('');
  console.log('Prerequisites:');
  console.log('  - Node.js installed on Windows');
  console.log('  - FFmpeg with GPU support (NVENC/AMF)');
  console.log('  - npm install @remotion/bundler @remotion/renderer remotion');
  console.log('');
  console.log('Note: WSL must be running to access files');
  process.exit(1);
}

const jsonFilePath = args[0];

renderLongFormWithGPU(jsonFilePath)
  .then(result => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
