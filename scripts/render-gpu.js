/**
 * Windows GPU Video Renderer
 * 
 * Prerequisites:
 * 1. Install Node.js on Windows: https://nodejs.org/
 * 2. Install FFmpeg with GPU support (NVENC for NVIDIA, AMF for AMD)
 * 3. Install dependencies: npm install @remotion/bundler @remotion/renderer remotion
 * 
 * Usage:
 *   node render-gpu.js <scenes-json-file>
 * 
 * Example:
 *   node render-gpu.js "The_Secret_Trick_scenes.json"
 * 
 * The script will:
 * 1. Read the scenes JSON exported from the web UI
 * 2. Access images/audio from WSL mount (\\wsl$\Ubuntu\...)
 * 3. Render using Windows GPU
 * 4. Save output to the same folder structure in WSL
 */

const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');
const path = require('path');
const fs = require('fs');
const http = require('http');

const VIDEO_CONFIG = {
  fps: 30,
  width: 1080,
  height: 1920,
};

// WSL Mount path - adjust if your WSL username is different
const WSL_MOUNT = '\\\\wsl$\\Ubuntu\\home\\nadim\\ytautomation\\public';

function resolveWSLPath(relativePath) {
  if (!relativePath) return null;
  // Handle paths like /generations/... 
  if (relativePath.startsWith('/')) {
    const wslPath = WSL_MOUNT + relativePath.replace(/\//g, '\\');
    return wslPath;
  }
  return relativePath;
}

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

async function startStaticServer(wsulMountPath, port = 3459) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url?.replace(/^\//, '') || '';
      let filePath = path.join(wsulMountPath, urlPath);
      
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
        fs.createReadStream(filePath).pipe(res);
      } else {
        console.log('404:', filePath);
        res.writeHead(404);
        res.end('Not found: ' + filePath);
      }
    });
    
    server.listen(port, () => resolve({ server, baseUrl: `http://localhost:${port}` }));
    server.on('error', reject);
  });
}

async function getAudioDuration(audioPath) {
  // For simplicity, assume ~5 seconds per scene
  // In production, you'd use ffprobe to get actual duration
  return 5;
}

async function renderWithGPU(scenesJsonPath) {
  // Load the exported JSON
  if (!fs.existsSync(scenesJsonPath)) {
    throw new Error(`Scenes file not found: ${scenesJsonPath}`);
  }

  const data = JSON.parse(fs.readFileSync(scenesJsonPath, 'utf-8'));
  const { title, scenes, outputPath } = data;

  console.log('===========================================');
  console.log('Windows GPU Video Renderer');
  console.log('===========================================');
  console.log(`Title: ${title}`);
  console.log(`Scenes: ${scenes.length}`);
  console.log(`Output: ${outputPath}`);
  console.log('');

  // Resolve output path
  const finalOutputPath = resolveWSLPath(outputPath);
  const outputDir = path.dirname(finalOutputPath);
  
  if (!fs.existsSync(outputDir)) {
    console.log('Creating output directory...');
    // Note: Creating directories on WSL from Windows may not work
    // Output will be saved to local temp if WSL mount is read-only
  }

  console.log('Starting local HTTP server...');
  const { server, baseUrl } = await startStaticServer(WSL_MOUNT);

  try {
    // Build scene timeline
    const timelineScenes = [];
    let currentFrame = 0;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      
      // Get audio duration (approximate)
      const durationInFrames = VIDEO_CONFIG.fps * 5; // 5 seconds default
      const startFrame = currentFrame;
      const endFrame = startFrame + durationInFrames;

      timelineScenes.push({
        id: `scene-${scene.index}`,
        imageSrc: `${baseUrl}${scene.image}`,
        audioSrc: `${baseUrl}${scene.audio}`,
        narration: scene.narration,
        durationInFrames,
        endFrame,
        sceneIndex: i,
        startFrame,
        transitionOverlap: 10,
        animationType: i === 0 ? 'none' : 'zoom-in',
      });

      currentFrame = endFrame;
    }

    const totalDurationInFrames = currentFrame;
    
    console.log(`Total duration: ${(totalDurationInFrames / VIDEO_CONFIG.fps).toFixed(1)} seconds`);
    console.log(`Hardware acceleration: if-possible (GPU)`);
    console.log('');

    // Prepare render props
    const renderProps = {
      scenes: timelineScenes,
      musicSrc: undefined,
      outputFilename: path.basename(finalOutputPath),
      totalDurationInFrames,
      title,
      baseUrl,
      narrationPositionBottom: '15%',
    };

    // Find remotion entry (look in current directory and parent)
    let remotionEntry = path.join(__dirname, 'remotion', 'index.ts');
    let remotionDir = __dirname;
    
    if (!fs.existsSync(remotionEntry)) {
      remotionEntry = path.join(__dirname, '..', 'remotion', 'index.ts');
      remotionDir = path.join(__dirname, '..');
    }

    console.log('Bundling Remotion project...');
    const bundleLocation = await bundle(
      remotionEntry,
      (progress) => console.log(`  Bundling: ${Math.round(progress * 100)}%`),
      { 
        outDir: path.join(remotionDir, '.remotion', 'bundles'),
        webpackOverride: (config) => config 
      }
    );

    console.log('Selecting composition...');
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'Video',
      inputProps: renderProps,
    });

    console.log('Rendering with GPU acceleration...');
    console.log('');
    
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: finalOutputPath,
      inputProps: renderProps,
      pixelFormat: 'yuv420p',
      crf: 23,
      hardwareAcceleration: 'if-possible', // Use GPU if available
    });

    console.log('');
    console.log('===========================================');
    console.log(`Render complete: ${finalOutputPath}`);
    console.log('===========================================');
    
    return { success: true, outputPath: finalOutputPath };
    
  } catch (err) {
    console.error('Render failed:', err);
    throw err;
  } finally {
    server.close();
  }
}

// Main
const args = process.argv.slice(2);

if (args.length < 1) {
  console.log('Windows GPU Video Renderer');
  console.log('==========================');
  console.log('');
  console.log('Usage: node render-gpu.js <scenes-json-file>');
  console.log('');
  console.log('Arguments:');
  console.log('  scenes-json-file   Path to JSON file exported from web UI');
  console.log('');
  console.log('Example:');
  console.log('  node render-gpu.js "The_Secret_Trick_scenes.json"');
  console.log('');
  console.log('Prerequisites:');
  console.log('  - Node.js installed on Windows');
  console.log('  - FFmpeg with GPU support (NVENC/AMF)');
  console.log('  - @remotion packages installed: npm install @remotion/bundler @remotion/renderer remotion');
  console.log('');
  console.log('Note: WSL must be running for the script to access files');
  process.exit(1);
}

const scenesFile = args[0];

renderWithGPU(scenesFile)
  .then(result => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
