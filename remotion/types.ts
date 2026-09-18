export interface SceneData {
  id: string;
  imageSrc: string;
  audioSrc: string;
  narration?: string;
  durationInFrames: number;
  sceneIndex?: number;
  audioDelay?: number;
}

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

/**
 * Pre-calculated timing values for a single scene.
 * All values are in milliseconds (ms) and computed once before rendering.
 *
 * CRITICAL: These values are computed during pre-calculation phase
 * and must NOT be recalculated during render loop.
 */
export interface SceneTimeline {
  scene_index: number;
  /** When this scene starts in absolute timeline (ms) */
  scene_start_ms: number;
  /** When the actual speech ends in this scene (ms) from scene start */
  speech_end_ms: number;
  /** When the transition should start (ms) = scene_start_ms + speech_end_ms */
  transition_start_ms: number;
  /** When this scene ends in absolute timeline (ms) */
  scene_end_ms: number;
  /** Total audio duration including trailing silence (ms) */
  audio_duration_ms: number;
  /** Duration of trailing silence at end of audio (ms) */
  trailing_silence_ms: number;
  /** Transition duration used = trailing_silence_ms (full, not capped) */
  transition_duration_ms: number;
}

// Transition types - smooth non-zoom transitions only
export type TransitionType =
  | 'cross-dissolve'
  | 'fade-through-black'
  | 'soft-wipe';

// Wipe directions for soft-wipe transition
export type WipeDirection = 'right' | 'left' | 'up' | 'down';

export interface TimelineSceneData {
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
  transitionType?: TransitionType;
  wipeDirection?: WipeDirection;
  narrationPositionBottom?: string;
  /** Pre-calculated timeline values (computed once, used during render) */
  timeline?: SceneTimeline;
  /** Audio speed analysis for dynamic playback rate adjustment */
  speedAnalysis?: {
    metadataDuration: number;
    estimatedSpeechDuration: number;
    recommendedPlaybackRate: number;
    confidence: number;
    reason: string;
  };
}

export interface VideoCompositionProps {
  scenes: TimelineSceneData[];
  musicSrc?: string;
  outputFilename: string;
  totalDurationInFrames?: number;
  title?: string;
  thumbnailImageSrc?: string;
  customLogoSrc?: string;
  baseUrl?: string;
  width?: number;
  height?: number;
}

export const VIDEO_CONFIG = {
  width: 1080,
  height: 1920,
  fps: 30,
  transitionDuration: 20,
  musicVolume: 0.08,
  musicFadeIn: 20,
  musicFadeOut: 20,
  // Logo configuration
  logo: {
    src: '/images/logos/logo.png',
    position: { x: 40, y: 40 }, // top-left with padding
    width: 100,
    opacity: 0.9,
  },
  // Thumbnail configuration
  thumbnail: {
    fontSize: 80,
    fontFamily: 'Inter',
    fontWeight: 700,
    textColor: '#FFFFFF',
    textAlign: 'left' as const,
    padding: 60,
    shadow: true,
  },
  // Background music folder
  musicFolder: '/audio/music/',
} as const;

export type RemotionInputProps = Record<string, unknown> & VideoCompositionProps;
