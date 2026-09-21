import { VIDEO_CONFIG, SceneTimeline } from '../types';
import { getAudioDuration, detectTrailingSilence, secondsToFrames, analyzeAudioSpeed, AudioSpeedAnalysis } from './audio-processing';

// Animation type allowlist (matches AnimationType in types.ts)
const VALID_ANIMATION_TYPES = new Set([
  'none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down',
  'slow-scale-rotate', 'parallax-layer', 'subtle-float', 'cinematic-push',
  'ken-burns', 'spiral-zoom', 'pulse-breathe', 'drift-diagonal',
  'focus-pull', 'orbit-light',
]);

function toAnimationType(v: string): AnimationType {
  return VALID_ANIMATION_TYPES.has(v) ? v as AnimationType : 'none'
}

// ============================================================
// CONFIGURATION
// ============================================================
const MAX_TRANSITION_MS = 600; // Maximum transition duration in milliseconds
const FPS = VIDEO_CONFIG.fps; // 30 fps
const MAX_VIDEO_DURATION_MS = 60_000; // 60 seconds max

// ============================================================
// TYPES
// ============================================================
export interface RawSceneInput {
  id: string;
  imageSrc: string;
  audioSrc: string;
  narration?: string;
  /** Override auto-assigned animation type. If omitted, buildTimeline auto-selects. */
  animationType?: string;
  /** Descriptive motion prompt for this scene (not used by Remotion, stored for reference). */
  videoMotionPrompt?: string;
}

export interface TimelineScene {
  id: string;
  imageSrc: string;
  audioSrc: string;
  narration?: string;
  startFrame: number;
  durationInFrames: number;
  endFrame: number;
  sceneIndex: number;
  transitionOverlap: number;
  animationType: AnimationType;
  wipeDirection?: string;
  /** Pre-calculated timeline values (computed once, used during render) */
  timeline?: SceneTimeline;
  /** Audio speed analysis for dynamic playback rate adjustment */
  speedAnalysis?: AudioSpeedAnalysis;
}

export interface Timeline {
  scenes: TimelineScene[];
  totalDurationInFrames: number;
  totalDurationInSeconds: number;
  /** Pre-calculated timeline for all scenes */
  sceneTimeline: SceneTimeline[];
}

// Animation types - each scene gets a different one
export type AnimationType =
  | 'none'
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down'
  | 'slow-scale-rotate'
  | 'parallax-layer'
  | 'subtle-float'
  | 'cinematic-push'
  | 'ken-burns'
  | 'spiral-zoom'
  | 'pulse-breathe'
  | 'drift-diagonal'
  | 'focus-pull'
  | 'orbit-light';

const ANIMATION_TYPES: AnimationType[] = [
  'zoom-in',
  'zoom-out',
  'pan-left',
  'pan-right',
  'pan-up',
  'pan-down',
  'slow-scale-rotate',
  'parallax-layer',
  'subtle-float',
  'cinematic-push',
  'ken-burns',
  'spiral-zoom',
  'pulse-breathe',
  'drift-diagonal',
  'focus-pull',
  'orbit-light',
];

// ============================================================
// PRE-CALCULATION PHASE
// ============================================================

/**
 * Result of scene timeline pre-calculation including speed analysis
 */
export interface SceneTimelineResult {
  /** Timeline data for each scene */
  sceneTimeline: SceneTimeline[];
  /** Speed analysis for each scene */
  speedAnalysis: AudioSpeedAnalysis[];
}

/**
 * Pre-calculate ALL scene timing values before rendering.
 *
 * This function:
 * 1. Loads each audio file
 * 2. Extracts total audio duration
 * 3. Detects ONLY trailing silence (no modification)
 * 4. Analyzes audio speed for playback rate adjustment
 * 5. Computes absolute timeline for all scenes
 * 6. Returns pre-calculated sceneTimeline array with speed analysis
 *
 * CRITICAL: All timing values are computed ONCE and stored.
 * DO NOT recalculate during render loop.
 */
export async function preCalculateSceneTimeline(
  scenes: RawSceneInput[]
): Promise<SceneTimelineResult> {
  if (!scenes || scenes.length === 0) {
    return { sceneTimeline: [], speedAnalysis: [] };
  }

  console.log('\n========================================');
  console.log('PRE-CALCULATING SCENE TIMELINE');
  console.log('========================================');
  console.log(`Scenes: ${scenes.length}`);
  console.log('Computing timing values for all scenes...');
  console.log('----------------------------------------\n');

  const sceneTimeline: SceneTimeline[] = [];
  const speedAnalysisList: AudioSpeedAnalysis[] = [];
  let currentStartMs = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    console.log(`[Scene ${i + 1}] Analyzing: ${scene.id}`);

    // Step 1: Load audio and extract duration
    const audioDurationSeconds = await getAudioDuration(scene.audioSrc);
    const audio_duration_ms = Math.round(audioDurationSeconds * 1000);
    console.log(`  Audio duration: ${audio_duration_ms}ms (${audioDurationSeconds.toFixed(3)}s)`);

    // Step 2: Detect ONLY trailing silence (analysis only, no modification)
    const trailing_silence_ms = await detectTrailingSilence(scene.audioSrc);
    console.log(`  Trailing silence: ${trailing_silence_ms}ms`);

    // Step 3: Calculate when speech ends
    const speech_end_ms = audio_duration_ms - trailing_silence_ms;
    console.log(`  Speech ends at: ${speech_end_ms}ms`);

    // Step 4: Calculate transition duration
    // CRITICAL: Use full trailing silence for transition (not capped)
    // This ensures the scene stays until narration completes
    const transition_duration_ms = trailing_silence_ms;
    console.log(`  Transition duration: ${transition_duration_ms}ms`);

    // Step 5: Analyze audio speed to determine if playback rate adjustment is needed
    const speedAnalysis = await analyzeAudioSpeed(scene.audioSrc, scene.narration);
    // Force consistent playback rate of 1.0 — all audio plays at normal speed
    speedAnalysis.recommendedPlaybackRate = 1.0;
    speedAnalysis.reason = 'Forced to 1.0 for consistent narration speed';
    speedAnalysisList.push(speedAnalysis);

    // Step 6: Compute absolute timeline
    const scene_start_ms = currentStartMs;
    const transition_start_ms = scene_start_ms + speech_end_ms;
    const scene_end_ms = scene_start_ms + audio_duration_ms;

    // Step 7: Store all pre-calculated values
    sceneTimeline.push({
      scene_index: i,
      scene_start_ms,
      speech_end_ms,
      transition_start_ms,
      scene_end_ms,
      audio_duration_ms,
      trailing_silence_ms,
      transition_duration_ms,
    });

    console.log(`  Timeline: ${scene_start_ms}ms -> ${scene_end_ms}ms`);
    console.log(`  Transition starts at: ${transition_start_ms}ms`);
    console.log('');

    // Next scene starts when this scene ends
    currentStartMs = scene_end_ms;
  }

  console.log('----------------------------------------');
  const totalDurationMs = sceneTimeline.reduce((sum, s) => sum + s.audio_duration_ms, 0);
  console.log(`TOTAL DURATION: ${totalDurationMs}ms (${(totalDurationMs / 1000).toFixed(2)}s)`);
  console.log('----------------------------------------\n');

  return { sceneTimeline, speedAnalysis: speedAnalysisList };
}

// ============================================================
// TIMELINE BUILDER (Uses pre-calculated values)
// ============================================================
export async function buildTimeline(
  scenes: RawSceneInput[],
  fps: number = FPS
): Promise<Timeline> {
  if (!scenes || scenes.length === 0) {
    console.warn('[Timeline] No scenes provided');
    return { scenes: [], totalDurationInFrames: 0, totalDurationInSeconds: 0, sceneTimeline: [] };
  }

  // ============================================================
  // PHASE 1: Pre-calculate ALL timing values
  // ============================================================
  const { sceneTimeline, speedAnalysis: speedAnalysisList } = await preCalculateSceneTimeline(scenes);

  // ============================================================
  // PHASE 2: Validate total duration
  // ============================================================
  validateTotalDuration(sceneTimeline);

  // ============================================================
  // PHASE 3: Build timeline using incremental frame accumulation
  // ============================================================
  console.log('\n========================================');
  console.log('BUILDING RENDER TIMELINE');
  console.log('========================================');
  console.log(`Using incremental frame accumulation (no drift)`);
  console.log(`FPS: ${fps}`);
  console.log('----------------------------------------\n');

  const timelineScenes: TimelineScene[] = [];

  // CRITICAL: Build timeline incrementally to avoid cumulative rounding drift
  let currentFrame = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const timing = sceneTimeline[i];
    const speedAnalysis = speedAnalysisList[i];

    console.log(`[Scene ${i + 1}] ${scene.id}`);

    // STEP 1: Calculate scene duration in frames
    // IMPORTANT: Use ORIGINAL audio duration, NOT adjusted
    // The playback rate will be used by the player/component to adjust audio speed
    // This ensures scene duration matches actual audio file length
    const durationInFrames = Math.round((timing.audio_duration_ms / 1000) * fps);

    // STEP 2: Build timeline incrementally (no recalculation from ms)
    const startFrame = currentFrame;
    const endFrame = startFrame + durationInFrames;

    // STEP 3: Calculate transition overlap in frames
    // Use original trailing silence (the component handles playback rate)
    // For scene 0 (intro), no transition overlap
    const rawTransitionOverlap = i === 0 ? 0 : Math.round((timing.trailing_silence_ms / 1000) * fps);
    const transitionOverlap = rawTransitionOverlap;

    // Animation type — use scene-provided override, else auto-select (scene 0 = none)
    const rawType = scenes[i].animationType
    const animationType = rawType ? toAnimationType(rawType) : (i === 0 ? 'none' : ANIMATION_TYPES[(i - 1) % ANIMATION_TYPES.length])

    // Wipe directions for soft-wipe transition (cycles: right, left, up, down)
    const WIPE_DIRECTIONS = ['right', 'left', 'up', 'down'] as const;
    const wipeDirection = i === 0 ? 'right' : WIPE_DIRECTIONS[(i - 1) % WIPE_DIRECTIONS.length];

    console.log(`  Audio duration: ${timing.audio_duration_ms}ms (${durationInFrames} frames)`);
    console.log(`  Trailing silence: ${timing.trailing_silence_ms}ms (${transitionOverlap} frames)`);
    console.log(`  Start frame: ${startFrame}`);
    console.log(`  End frame: ${endFrame}`);
    console.log(`  Transition overlap: ${transitionOverlap} frames`);
    console.log(`  Animation: ${animationType}`);
    console.log(`  Wipe Direction: ${wipeDirection}`);
    console.log(`  Playback rate: ${speedAnalysis.recommendedPlaybackRate.toFixed(3)} (${speedAnalysis.reason})`);
    console.log('');

    timelineScenes.push({
      id: scene.id,
      imageSrc: scene.imageSrc,
      audioSrc: scene.audioSrc,
      narration: scene.narration,
      startFrame,
      durationInFrames,
      endFrame,
      sceneIndex: i,
      transitionOverlap,
      animationType,
      wipeDirection,
      timeline: timing, // Store pre-calculated timing
      speedAnalysis, // Store speed analysis for playback rate adjustment
    });

    // Increment currentFrame for next scene (no overlap, no gap)
    currentFrame = endFrame;
  }

  // Cap total video duration at 60 seconds
  const rawTotalMs = (currentFrame / fps) * 1000;
  if (rawTotalMs > MAX_VIDEO_DURATION_MS) {
    console.log(`[Timeline] Raw duration ${(rawTotalMs / 1000).toFixed(2)}s exceeds 60s limit — truncating...`);
    const maxFrames = Math.floor((MAX_VIDEO_DURATION_MS / 1000) * fps);
    let accumulated = 0;
    const scenesToKeep: typeof timelineScenes = [];
    for (let i = 0; i < timelineScenes.length; i++) {
      const scene = timelineScenes[i];
      const sceneEnd = accumulated + scene.durationInFrames;
      if (accumulated >= maxFrames) break;
      if (sceneEnd <= maxFrames) {
        scenesToKeep.push(scene);
        accumulated = sceneEnd;
      } else {
        // Partial scene — truncate duration to fit
        const remainingFrames = maxFrames - accumulated;
        const truncatedScene = { ...scene, durationInFrames: remainingFrames, endFrame: maxFrames };
        scenesToKeep.push(truncatedScene);
        accumulated = maxFrames;
        break;
      }
    }
    timelineScenes.length = 0;
    timelineScenes.push(...scenesToKeep);
    currentFrame = maxFrames;
    console.log(`[Timeline] After truncation: ${scenesToKeep.length} scenes, ${currentFrame} frames (${(currentFrame / fps).toFixed(2)}s)`);
  }

  // Calculate total duration
  const totalDurationInFrames = currentFrame;
  const totalDurationInSeconds = totalDurationInFrames / fps;

  console.log('----------------------------------------');
  console.log(`TOTAL DURATION: ${totalDurationInFrames} frames (${totalDurationInSeconds.toFixed(2)}s)`);
  console.log('----------------------------------------\n');

  // Debug log
  debugLogTimeline({ scenes: timelineScenes, totalDurationInFrames, totalDurationInSeconds, sceneTimeline });

  // Validate timeline
  validateTimeline(timelineScenes);

  return {
    scenes: timelineScenes,
    totalDurationInFrames,
    totalDurationInSeconds,
    sceneTimeline,
  };
}

// ============================================================
// VALIDATION
// ============================================================

/**
 * Validate that total timeline matches total audio duration
 * Uses ORIGINAL audio durations (not adjusted by playback rate)
 */
function validateTotalDuration(sceneTimeline: SceneTimeline[]): void {
  console.log('[Timeline] Validating total duration...');

  // Calculate total original audio duration
  const totalAudioDurationMs = sceneTimeline.reduce((sum, s) => sum + s.audio_duration_ms, 0);

  // Total video duration is the last scene's end time
  const lastScene = sceneTimeline[sceneTimeline.length - 1];
  const totalVideoDurationMs = lastScene ? lastScene.scene_end_ms : 0;

  console.log(`  Total audio duration: ${totalAudioDurationMs.toFixed(0)}ms`);
  console.log(`  Total video duration: ${totalVideoDurationMs.toFixed(0)}ms`);

  // Allow up to 1 frame tolerance (~33ms at 30fps)
  const diff = Math.abs(totalAudioDurationMs - totalVideoDurationMs);
  if (diff > 33) {
    console.warn(`[Timeline] Duration mismatch: ${diff.toFixed(0)}ms difference`);
  } else {
    console.log(`[Timeline] Duration validation passed: ${totalAudioDurationMs.toFixed(0)}ms\n`);
  }
}

function validateTimeline(scenes: TimelineScene[]): void {
  console.log('[Timeline] Validating timeline structure...');

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];

    // Check for negative start frame
    if (scene.startFrame < 0) {
      throw new Error(`Scene ${i}: Negative start frame ${scene.startFrame}`);
    }

    // Check for invalid duration
    if (scene.durationInFrames <= 0) {
      throw new Error(`Scene ${i}: Invalid duration ${scene.durationInFrames}`);
    }

    // Check end frame matches start + duration
    const expectedEnd = scene.startFrame + scene.durationInFrames;
    if (scene.endFrame !== expectedEnd) {
      throw new Error(`Scene ${i}: End frame mismatch (expected ${expectedEnd}, got ${scene.endFrame})`);
    }

    // Check that timeline data exists
    if (!scene.timeline) {
      throw new Error(`Scene ${i}: Missing pre-calculated timeline data`);
    }

    // Check that speed analysis exists
    if (!scene.speedAnalysis) {
      throw new Error(`Scene ${i}: Missing speed analysis data`);
    }
  }

  console.log(`[Timeline] Structure validation passed\n`);

  // ============================================================
  // VALIDATION: Check for frame drift 
  // ============================================================
  console.log('[Timeline] Validating frame drift...');

  const fps = FPS;
  const totalFrames = scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0);
  const totalVideoDurationSeconds = totalFrames / fps;

  // Calculate total original audio duration
  const totalOriginalAudioDurationMs = scenes.reduce(
    (sum, scene) => sum + (scene.timeline?.audio_duration_ms || 0),
    0
  );
  const totalAudioDurationSeconds = totalOriginalAudioDurationMs / 1000;

  // Calculate difference in seconds
  const durationDiffSeconds = Math.abs(totalVideoDurationSeconds - totalAudioDurationSeconds);
  // Allow up to 1 frame tolerance (~33ms at 30fps)
  const maxAllowedDifference = 1 / fps;

  console.log(`  Total frames: ${totalFrames}`);
  console.log(`  Total video duration: ${totalVideoDurationSeconds.toFixed(3)}s`);
  console.log(`  Total audio duration: ${totalAudioDurationSeconds.toFixed(3)}s`);
  console.log(`  Difference: ${durationDiffSeconds.toFixed(3)}s`);
  console.log(`  Max allowed: ${maxAllowedDifference.toFixed(3)}s (1 frame)`);

  if (durationDiffSeconds > maxAllowedDifference) {
    throw new Error(
      `[Timeline] CRITICAL: Frame drift detected!\n` +
      `  Total frames: ${totalFrames}\n` +
      `  Total video duration: ${totalVideoDurationSeconds.toFixed(3)}s\n` +
      `  Total audio duration: ${totalAudioDurationSeconds.toFixed(3)}s\n` +
      `  Difference: ${durationDiffSeconds.toFixed(3)}s (${(durationDiffSeconds * fps).toFixed(1)} frames)\n` +
      `  Max allowed: ${maxAllowedDifference.toFixed(3)}s (1 frame)`
    );
  }

  console.log(`[Timeline] Frame drift validation passed\n`);
}

// ============================================================
// DEBUG LOGGING
// ============================================================
export function debugLogTimeline(timeline: Timeline): void {
  console.log('\n========== PRE-CALCULATED TIMELINE ==========');

  timeline.sceneTimeline.forEach((timing, i) => {
    const scene = timeline.scenes[i];
    console.log(`\nScene ${i} (${scene?.id || 'unknown'}):`);
    console.log(`  scene_start_ms: ${timing.scene_start_ms}ms`);
    console.log(`  speech_end_ms: ${timing.speech_end_ms}ms (from start)`);
    console.log(`  transition_start_ms: ${timing.transition_start_ms}ms (absolute)`);
    console.log(`  scene_end_ms: ${timing.scene_end_ms}ms (absolute)`);
    console.log(`  audio_duration_ms: ${timing.audio_duration_ms}ms`);
    console.log(`  trailing_silence_ms: ${timing.trailing_silence_ms}ms`);
    console.log(`  transition_duration_ms: ${timing.transition_duration_ms}ms`);

    if (scene) {
      const transitionStartFrame = Math.round(((timing.transition_start_ms - timing.scene_start_ms) / 1000) * 30);
      console.log(`  [Frames] Start: ${scene.startFrame}, End: ${scene.endFrame}, Duration: ${scene.durationInFrames}`);
      console.log(`  [Frames] Transition window: ${transitionStartFrame}-${scene.durationInFrames}`);
    }
  });

  console.log('\n=============================================\n');
}

export { ANIMATION_TYPES };
