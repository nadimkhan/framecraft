// Windows GPU Render Script
// Run this from Windows CMD/PowerShell: node windows-render.js
//
// This script renders videos using Windows GPU (NVENC/AMD VCE)
// while saving files to the WSL mounted filesystem

const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');
const path = require('path');
const fs = require('fs');
const http = require('http');

const WSL_MOUNT_PATH = '\\\\wsl$\\Ubuntu\\home\\nadim\\ytautomation\\public';
const LOCAL_GENERATIONS = 'C:\\Users\\Nadim\\ytautomation\\public\\generations';

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

function resolvePath(relativePath) {
  // Convert /generations/... to WSL mount path
  let fullPath = relativePath;
  if (relativePath.startsWith('/')) {
    fullPath = path.join(WSL_MOUNT_PATH, relativePath.substring(1));
  }
  return fullPath;
}

async function startStaticServer(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let filePath = resolvePath(req.url?.replace(/^\//, '') || '');
      
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found: ' + filePath);
      }
    });

    server.on('error', reject);
    server.listen(port, () => {
      resolve({ server, baseUrl: `http://localhost:${port}` });
    });
  });
}

async function renderVideoGPU(scenes, outputPath, title) {
  const serverPort = 3458;
  const { server, baseUrl } = await startStaticServer(serverPort);

  try {
    console.log('=== GPU Render Starting ===');
    console.log('Output:', outputPath);
    console.log('Using hardware acceleration (GPU)');

    const timelineSceneData = scenes.map((scene, index) => ({
      id: `scene-${index}`,
      imageSrc: `${baseUrl}${scene.image}`,
      audioSrc: `${baseUrl}${scene.audio}`,
      narration: scene.narration,
      startFrame: index * 150, // Approximate - should calculate from audio
      durationInFrames: 150,
      endFrame: (index + 1) * 150,
      sceneIndex: index,
      transitionOverlap: 0,
      animationType: index === 0 ? 'none' : 'zoom-in',
    }));

    const totalFrames = timelineSceneData.length * 150;

    const renderProps = {
      scenes: timelineSceneData,
      musicSrc: undefined,
      outputFilename: path.basename(outputPath),
      totalDurationInFrames: totalFrames,
      title,
      baseUrl,
    };

    const REMOTION_ENTRY = path.join(__dirname, 'remotion', 'index.ts');
    
    console.log('Bundling Remotion...');
    const bundleLocation = await bundle(
      REMOTION_ENTRY,
      (progress) => console.log(`Bundling: ${Math.round(progress * 100)}%`),
      { outDir: path.join(__dirname, '.remotion', 'bundles') }
    );

    console.log('Selecting composition...');
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'Video',
      inputProps: renderProps,
    });

    console.log('Rendering with GPU acceleration...');
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: renderProps,
      pixelFormat: 'yuv420p',
      crf: 23,
      hardwareAcceleration: 'if-possible', // Use GPU if available
    });

    console.log(`Render complete: ${outputPath}`);
    return { success: true, outputPath };
  } finally {
    server.close();
  }
}

// CLI Usage
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node windows-render.js <scenes-json-file> <output-path> [title]');
  console.log('Example: node windows-render.js scenes.json "C:\\output\\video.mp4" "My Video"');
  process.exit(1);
}

const scenesFile = args[0];
const outputPath = args[1];
const title = args[2] || 'Video';

if (!fs.existsSync(scenesFile)) {
  console.error('Scenes file not found:', scenesFile);
  process.exit(1);
}

const scenes = JSON.parse(fs.readFileSync(scenesFile, 'utf-8'));
console.log('Scenes loaded:', scenes.length);

renderVideoGPU(scenes, outputPath, title)
  .then(result => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
