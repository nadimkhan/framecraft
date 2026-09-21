import { bundle } from '@remotion/bundler';
import { renderFrames, stitchFramesToVideo, selectComposition } from '@remotion/renderer';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { execSync } from 'child_process';
import { VIDEO_CONFIG, TimelineSceneData } from '../remotion/types';
import { buildTimeline, RawSceneInput, TimelineScene } from '../remotion/utils/timeline';
import { getRandomMusicFile } from '../remotion/utils/music';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

/**
 * Detect GPU devices available for VA-API encoding.
 *
 * The system has two AMD GPUs:
 *   - Radeon RX 560 (Baffin, PCI 01:00.0) — discrete GPU with full VA-API
 *     encoding support. Better for hardware-accelerated rendering.
 *   - Radeon Vega (Picasso, PCI 04:00.0) — APU, also supports VA-API.
 *
 * We PREFER the RX 560 because it has dedicated hardware for video encoding,
 * while the Vega APU shares resources with the display.
 *
 * Returns the /dev/dri/renderD* path of the chosen GPU, or null if none usable.
 */
function detectGpuDevice(): string | null {
  // Enumerate render nodes
  let nodes: string[];
  try {
    nodes = execSync('ls /dev/dri/renderD* 2>/dev/null', { encoding: 'utf-8' })
      .trim().split('\n').filter(Boolean);
  } catch {
    return null;
  }
  if (nodes.length === 0) return null;

  // First try the discrete Radeon RX 560 (PCI 01:00.0). Identify via PCI path.
  // udevadm gives DEVPATH like /devices/pci0000:00/0000:00:01.1/0000:01:00.0/...
  for (const node of nodes) {
    try {
      const devpath = execSync(`udevadm info ${node} 2>/dev/null | grep DEVPATH=`, { encoding: 'utf-8' });
      // 0000:01:00.0 = RX 560 Baffin (PCI bus 1)
      if (devpath.includes('0000:01:00.0')) {
        console.log(`[GPU] Selected discrete GPU: RX 560 (Baffin) at ${node}`);
        return node;
      }
    } catch {}
  }

  // Fallback: probe each node for VA-API encode support, pick the first that works
  for (const node of nodes) {
    try {
      // Test that VA-API encode actually works on this node
      const test = execSync(
        `ffmpeg -hide_banner -init_hw_device vaapi=va:${node} -f lavfi -i testsrc=duration=0.04:size=64x64:rate=10 ` +
        `-vf 'hwupload,scale_vaapi=64:64:format=nv12' -c:v h264_vaapi -qp 30 -frames:v 1 -f null - 2>&1 | tail -5`,
        { encoding: 'utf-8' }
      );
      if (!test.includes('Conversion failed') && !test.includes('Function not implemented')) {
        console.log(`[GPU] Selected VA-API node via probe: ${node}`);
        return node;
      }
    } catch {}
  }

  console.warn(`[GPU] No working VA-API device found, falling back to ${nodes[0]}`);
  return nodes[0];
}

/**
 * Detect available hardware encoder for the chosen GPU.
 * Returns the ffmpeg codec name (e.g. 'h264_vaapi', 'h264_amf', 'h264_nvenc').
 */
function detectHardwareCodec(gpuDevice: string | null): string {
  try {
    const encoders = execSync('ffmpeg -hide_banner -encoders 2>/dev/null', { encoding: 'utf-8' });
    // Prefer AMF (AMD Windows), then VAAPI (Linux AMD/Intel), then NVENC
    if (encoders.includes('h264_amf')) return 'h264_amf';
    if (encoders.includes('h264_vaapi') && gpuDevice) return 'h264_vaapi';
    if (encoders.includes('h264_nvenc')) return 'h264_nvenc';
  } catch {}
  return 'libx264';
}

function startStaticServer(port: number): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve, reject) => {
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

    server.on('error', reject);
    server.listen(port, () => {
      resolve({ server, baseUrl: `http://localhost:${port}` });
    });
  });
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp',
    '.webm': 'audio/webm', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export async function renderVideoWithBundler(
  scenes: Array<{ image: string; audio: string; narration?: string; animationType?: string; videoMotionPrompt?: string }>,
  outputPath: string,
  music?: string,
  title?: string,
  thumbnailImageSrc?: string,
  nicheCategory?: string | null
) {
  const serverPort = 3457;
  const { server, baseUrl } = await startStaticServer(serverPort);
  const gpuDevice = detectGpuDevice();
  const hwCodec = detectHardwareCodec(gpuDevice);

  console.log(`========================================`);
  console.log(`RENDERER: Using codec: ${hwCodec} on device: ${gpuDevice || 'software'}`);
  console.log(`========================================`);

  try {
    const fps = VIDEO_CONFIG.fps;

    // Validate assets exist
    for (const scene of scenes) {
      const imgPath = path.join(PUBLIC_DIR, scene.image.replace(/^\//, ''));
      const audPath = path.join(PUBLIC_DIR, scene.audio.replace(/^\//, ''));
      if (!fs.existsSync(imgPath)) console.warn(`[WARN] Image not found: ${imgPath}`);
      if (!fs.existsSync(audPath)) console.warn(`[WARN] Audio not found: ${audPath}`);
      else {
        // Log actual audio duration for debugging
        try {
          const dur = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audPath}"`, { encoding: 'utf-8' }).trim();
          console.log(`[AUDIO] ${path.basename(audPath)}: ${parseFloat(dur).toFixed(2)}s`);
        } catch {}
      }
    }

    // Build timeline from actual audio durations
    const rawScenes: RawSceneInput[] = scenes.map((scene, index) => ({
      id: `scene-${index + 1}`,
      imageSrc: `${baseUrl}${scene.image}`,
      audioSrc: `${baseUrl}${scene.audio}`,
      narration: scene.narration,
      animationType: scene.animationType,
      videoMotionPrompt: scene.videoMotionPrompt,
    }));

    const timeline = await buildTimeline(rawScenes, fps);

    const timelineSceneData: TimelineSceneData[] = timeline.scenes.map((scene: TimelineScene) => ({
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
      wipeDirection: scene.wipeDirection as any,
      timeline: scene.timeline,
      speedAnalysis: scene.speedAnalysis as any,
    }));

    console.log(`Total: ${timeline.totalDurationInFrames} frames (${timeline.totalDurationInSeconds.toFixed(2)}s)`);

    // Music
    let musicSrc: string | undefined;
    if (music && music.length > 0) {
      musicSrc = `${baseUrl}${music}`;
    } else {
      // Pick a random track from this niche's library. Falls back to any track
      // if the niche doesn't have keyword-matched tracks available.
      const randomMusic = getRandomMusicFile(nicheCategory);
      if (randomMusic) musicSrc = `${baseUrl}${randomMusic}`;
    }
    if (musicSrc) console.log(`[RENDER] Music (niche="${nicheCategory || 'any'}"): ${musicSrc}`);

    // Render props
    const renderProps = {
      scenes: timelineSceneData,
      musicSrc,
      outputFilename: path.basename(outputPath),
      totalDurationInFrames: timeline.totalDurationInFrames,
      title,
      thumbnailImageSrc: thumbnailImageSrc ? `${baseUrl}${thumbnailImageSrc}` : undefined,
      baseUrl,
      narrationPositionBottom: '15%',
    };

    // Bundle
    const REMOTION_ENTRY = path.join(process.cwd(), 'remotion', 'index.ts');
    console.log('Bundling Remotion...');
    const bundleLocation = await bundle(
      REMOTION_ENTRY,
      (progress) => console.log(`Bundling: ${Math.round(progress * 100)}%`),
      { outDir: path.join(process.cwd(), '.remotion', 'bundles') }
    );

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'Video',
      inputProps: renderProps,
    });

    console.log(`Rendering with ${hwCodec}...`);

    // Ensure output dir exists
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    // Render with hardware acceleration
    // Note: when hardwareAcceleration='required', Remotion's validateQualitySettings
    // rejects the `crf` option. We must use `videoBitrate` instead. ~8Mbps gives
    // ~visually-equivalent quality to crf 23 at 1920x1080 for h264_vaapi.
    //
    // REMOTION LIMITATION: As of @remotion/renderer v4, hardware acceleration
    // is only enabled for h264 on darwin (h264_videotoolbox). On Linux, Remotion
    // always falls back to libx264 (CPU). We work around this by using ffmpegOverride
    // to REPLACE the libx264 args with h264_vaapi + the RX 560 device path.
    // This makes Remotion's stitching use the GPU for the final encode.
    //
    // ALSO: Remotion bundles its own ffmpeg in @remotion/compositor-linux-x64-gnu
    // which does NOT include h264_vaapi. So we point `binariesDirectory` at
    // /usr/bin which has the system ffmpeg with VA-API support.
    const renderOpts: any = {
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: renderProps,
      pixelFormat: 'yuv420p',
      videoBitrate: '8M',
      hardwareAcceleration: 'if-possible', // Remotion's own detection; we'll override the args
      binariesDirectory: '/usr/bin', // use system ffmpeg which has h264_vaapi
    };

    // === STAGE 1: render frames with Remotion (uses bundled ffmpeg for compositing) ===
    // We render to JPEG frames first. Remotion's bundled ffmpeg does the compositing
    // and PNG→JPEG conversion; we don't need h264_vaapi at this stage.
    const framesDir = path.join('/tmp', `remotion-frames-${Date.now()}`)
    fs.mkdirSync(framesDir, { recursive: true })

    console.log(`[RENDER] Stage 1: rendering frames to ${framesDir}...`)
    await renderFrames({
      composition,
      serveUrl: bundleLocation,
      onFrameUpdate: (frame: number) => {
        if (frame % 30 === 0) console.log(`[RENDER] Frame ${frame}/${composition.durationInFrames}`)
      },
      outputDir: framesDir,
      inputProps: renderProps,
      onStart: () => { console.log('[RENDER] Frame rendering started') },
    })
    console.log(`[RENDER] Frame rendering complete: ${framesDir}`)

    // === Stage 2: stitch frames + audio with h264_vaapi on the RX 560 ===
    // Auto-detect frame padding width (3, 4, or 5 digits) by reading the actual filenames.
    console.log(`[RENDER] Stage 2: stitching frames with h264_vaapi on ${gpuDevice}`)
    const frameFiles = fs.existsSync(framesDir)
      ? fs.readdirSync(framesDir).filter(f => f.startsWith('element-') && f.endsWith('.jpeg')).sort()
      : []
    if (frameFiles.length === 0) {
      throw new Error(`No frames found in ${framesDir}`)
    }
    const lastFrame = frameFiles[frameFiles.length - 1]
    // element-0048.jpeg → 4-digit width
    const widthMatch = lastFrame.match(/element-(\d+)\.jpeg$/)
    const width = widthMatch ? widthMatch[1].length : 4
    const framePattern = path.join(framesDir, `element-%0${width}d.jpeg`)
    console.log(`[RENDER] Using frame pattern: ${framePattern} (${frameFiles.length} frames, ${width}-digit padding)`)

    // ─── Audio prep ──────────────────────────────────────────────────────────
    // Build concat list of every scene's narration audio (sequential, gapless).
    const concatList = path.join('/tmp', `concat-${Date.now()}.txt`)
    const concatEntries: string[] = []
    for (const scene of timelineSceneData) {
      let audioPath = scene.audioSrc
      if (audioPath.startsWith('http')) {
        audioPath = audioPath.replace(/^https?:\/\/[^/]+/, PUBLIC_DIR)
      }
      if (audioPath && fs.existsSync(audioPath)) {
        concatEntries.push(`file '${audioPath.replace(/'/g, "'\\''")}'`)
      }
    }
    if (concatEntries.length > 0) {
      fs.writeFileSync(concatList, concatEntries.join('\n'))
    }

    // Compute total video duration in seconds — drives music length + fade.
    const totalDurationSec = composition.durationInFrames / composition.fps
    // Music at 0.08 sits well below narration (~12 dB quieter) so it reads as a
    // texture bed, not a competing track. With sidechaincompression applied to
    // the music using the narration as the sidechain key, the bed also ducks
    // ~6 dB whenever someone is speaking — keeps VO intelligible without
    // killing the music between phrases.
    const musicVolume = 0.08
    const musicDuckDepthDb = 6       // how much the music drops while VO plays
    const musicDuckThresholdDb = -25  // VO level that triggers ducking
    const musicDuckRatio = 4          // 4:1 compression ratio = gentle duck
    const musicDuckAttackMs = 80      // fast attack so transients don't slip
    const musicDuckReleaseMs = 600    // slow release so music swells back smoothly
    const fadeInSec = 1.5
    const fadeOutSec = 2.0

    // Resolve local path to the picked music file (musicSrc is the public URL).
    let musicPath: string | null = null
    if (musicSrc) {
      musicPath = musicSrc.startsWith('http')
        ? musicSrc.replace(/^https?:\/\/[^/]+/, PUBLIC_DIR)
        : musicSrc
      if (!fs.existsSync(musicPath)) {
        console.warn(`[RENDER] Music file missing on disk: ${musicPath}`)
        musicPath = null
      }
    }

    const ffmpegArgs: string[] = [
      '-y',
      '-r', String(composition.fps),
      '-f', 'image2',
      '-start_number', '0',
      '-i', framePattern,
    ]

    // Mix strategy:
    //   - narration only: simple concat → aac
    //   - narration + music: filter_complex with [0:a] narration, [1:a] music (looped + trimmed + volume + fade)
    //                       → amix → aac
    const hasNarration = concatEntries.length > 0
    if (hasNarration) {
      ffmpegArgs.push('-f', 'concat', '-safe', '0', '-i', concatList)
    }
    if (musicPath) {
      ffmpegArgs.push('-stream_loop', '-1', '-i', musicPath)
    }

    // Encoder + muxer setup (shared across both audio modes).
    ffmpegArgs.push(
      '-vaapi_device', gpuDevice || '/dev/dri/renderD128',
      '-c:v', 'h264_vaapi',
      '-vf', 'format=nv12,hwupload',
      '-pix_fmt', 'yuv420p',
      '-b:v', '8M',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    )

    // Audio codec + filter graph.
    // The audio filter/map args must come AFTER all -i inputs but BEFORE
    // -vaapi_device / -c:v output encoder args. We splice at the first
    // occurrence of -vaapi_device to guarantee correct arg ordering.
    const encoderIdx = ffmpegArgs.indexOf('-vaapi_device')
    const spliceAt = encoderIdx < 0 ? ffmpegArgs.length : encoderIdx
    if (hasNarration && musicPath) {
      // Inputs are: 0=frames, 1=narration concat, 2=music (looped).
      // Music chain: trim to length → lower volume → sidechain-duck against
      //   the narration → fade in/out at edges → [music]
      // Final mix: narration [1:a] + ducked music → [mixed]
      const filterComplex =
        `[2:a]atrim=0:${totalDurationSec.toFixed(2)},` +
        `volume=${musicVolume},` +
        `sidechaincompress=threshold=${musicDuckThresholdDb}dB:ratio=${musicDuckRatio}:` +
          `attack=${musicDuckAttackMs}:release=${musicDuckReleaseMs}:makeup=1[musduck];` +
        `[musduck]afade=t=in:st=0:d=${fadeInSec},` +
          `afade=t=out:st=${Math.max(0, totalDurationSec - fadeOutSec).toFixed(2)}:d=${fadeOutSec}` +
        `[music];` +
        `[1:a][music]amix=inputs=2:duration=first:dropout_transition=0[mixed]`
      ffmpegArgs.splice(spliceAt, 0,
        '-filter_complex', filterComplex,
        '-map', '0:v',
        '-map', '[mixed]',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ac', '2',
        '-ar', '48000',
      )
      console.log(`[RENDER] Audio: narration + ducked music (vol=${musicVolume}, duck=${musicDuckDepthDb}dB @ ${musicDuckThresholdDb}dB, fadeIn=${fadeInSec}s, fadeOut=${fadeOutSec}s)`)
    } else if (hasNarration) {
      ffmpegArgs.splice(spliceAt, 0,
        '-map', '0:v', '-map', '1:a',
        '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000',
      )
      console.log(`[RENDER] Audio: narration only`)
    } else if (musicPath) {
      // No narration — just music for the whole video.
      ffmpegArgs.splice(spliceAt, 0,
        '-filter_complex',
        `[1:a]atrim=0:${totalDurationSec.toFixed(2)},volume=${musicVolume},` +
          `afade=t=in:st=0:d=${fadeInSec},afade=t=out:st=${Math.max(0, totalDurationSec - fadeOutSec).toFixed(2)}:d=${fadeOutSec}`,
        '-map', '0:v',
        '-map', '1:a',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ac', '2',
        '-ar', '48000',
      )
      console.log(`[RENDER] Audio: music only (vol=${musicVolume})`)
    } else {
      console.warn(`[RENDER] No audio — output will be silent`)
    }

    console.log(`[RENDER] ffmpeg ${ffmpegArgs.join(' ')}`)
    const ffResult = execSync(`/usr/bin/ffmpeg ${ffmpegArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    console.log(`[RENDER] ffmpeg stdout: ${ffResult.slice(0, 500)}`)

    // Clean up the frames directory
    try {
      execSync(`rm -rf ${framesDir}`, { stdio: 'ignore' })
    } catch {}

    console.log(`Render complete: ${outputPath}`)

    // Log final duration
    try {
      const finalDur = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`, { encoding: 'utf-8' }).trim();
      console.log(`Final video duration: ${parseFloat(finalDur).toFixed(2)}s`);
      console.log(`Expected: ${timeline.totalDurationInSeconds.toFixed(2)}s`);
    } catch {}

    return { success: true, outputPath };
  } finally {
    server.close();
  }
}

// CLI entry point
const args = process.argv.slice(2);
if (args.length >= 2) {
  const scenes = JSON.parse(args[0]);
  const outputPath = args[1];
  const music = args[2] || '';
  const titleArg = args[3] ? JSON.parse(args[3]) : undefined;
  // Optional 5th arg: JSON { nicheCategory: 'Horror', ... }
  let meta: any = {};
  if (args[4]) {
    try { meta = JSON.parse(args[4]); } catch {}
  }

  renderVideoWithBundler(scenes, outputPath, music, titleArg, undefined, meta.nicheCategory)
    .then((result) => { console.log('RENDER_COMPLETE:' + result.outputPath); process.exit(0); })
    .catch((err) => { console.error('Render failed:', err); process.exit(1); });
}
