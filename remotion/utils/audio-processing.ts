import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Get audio duration using ffprobe - reads actual file duration
 * @param audioPath - Path or URL to audio file
 */
export async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve) => {
    let fullPath: string;
    
    // Handle URLs like http://localhost:3457/generations/...
    if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
      // Extract the path from the URL
      const urlObj = new URL(audioPath);
      const urlPath = urlObj.pathname;
      fullPath = path.join(process.cwd(), 'public', urlPath.replace(/^\//, ''));
    } else if (audioPath.startsWith('/')) {
      fullPath = path.join(process.cwd(), 'public', audioPath.replace(/^\//, ''));
    } else {
      fullPath = audioPath;
    }
    
    if (!fs.existsSync(fullPath)) {
      // CRITICAL: Audio file must exist - this is a required asset
      // Don't use narration text fallback - use a reasonable default based on typical TTS
      // TTS typically produces ~3-4 words per second, so estimate from expected word count
      const estimatedSeconds = 8; // Reasonable default for typical scene narration
      console.error(`Audio file not found: ${fullPath}`);
      console.error(`  Using estimated duration: ${estimatedSeconds}s (this may cause sync issues)`);
      resolve(estimatedSeconds);
      return;
    }
    
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      fullPath
    ]);
    
    let output = '';
    ffprobe.stdout.on('data', (data) => { output += data.toString(); });
    ffprobe.on('close', (code) => {
      if (code === 0 && output.trim()) {
        const duration = parseFloat(output.trim());
        if (!isNaN(duration) && duration > 0) {
          resolve(duration);
        } else {
          console.error(`Invalid duration for ${fullPath}`);
          resolve(8); // Default fallback
        }
      } else {
        console.error(`FFprobe failed for ${fullPath}`);
        resolve(8); // Default fallback
      }
    });
    ffprobe.on('error', (err) => {
      console.error(`FFprobe error for ${fullPath}: ${err.message}`);
      resolve(8); // Default fallback
    });
  });
}

/**
 * Preserve original audio - returns the original path unchanged.
 * This function replaces the old trimTrailingSilence() to ensure
 * full audio duration is preserved including all natural pauses.
 */
export function preserveOriginalAudio(audioPath: string): string {
  return audioPath;
}

/**
 * Detect trailing silence in audio file (ANALYSIS ONLY - does not modify file).
 *
 * Scans waveform from end backwards to find where speech ends.
 * Returns the duration of trailing silence in milliseconds.
 *
 * @param audioPath - Path to audio file
 * @returns Trailing silence duration in milliseconds
 */
export async function detectTrailingSilence(audioPath: string): Promise<number> {
  let fullPath: string;
  
  // Handle URLs like http://localhost:3457/generations/...
  if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
    const urlObj = new URL(audioPath);
    const urlPath = urlObj.pathname;
    fullPath = path.join(process.cwd(), 'public', urlPath.replace(/^\//, ''));
  } else if (audioPath.startsWith('/')) {
    fullPath = path.join(process.cwd(), 'public', audioPath.replace(/^\//, ''));
  } else {
    fullPath = audioPath;
  }

  if (!fs.existsSync(fullPath)) {
    console.warn(`Audio file not found for silence detection: ${fullPath}`);
    // Estimate trailing silence based on audio duration
    return 500; // 500ms default estimate
  }

  return new Promise((resolve) => {
    // Use silencedetect to find all silence regions
    const detect = spawn('ffmpeg', [
      '-i', fullPath,
      '-af', 'silencedetect=noise=-40dB:d=0.1',
      '-f', 'null',
      '-'
    ]);

    let output = '';
    detect.stderr.on('data', (data) => { output += data.toString(); });
    detect.on('close', () => {
      // Parse all silence regions
      const silenceStarts = output.match(/silence_start:\s*([\d.]+)/g);
      const silenceEnds = output.match(/silence_end:\s*([\d.]+)/g);

      if (!silenceStarts || !silenceEnds || silenceStarts.length === 0) {
        // No silence detected
        resolve(0);
        return;
      }

      // Get the LAST silence region (trailing silence)
      const lastSilenceStart = parseFloat(silenceStarts[silenceStarts.length - 1].split(': ')[1]);
      const lastSilenceEnd = parseFloat(silenceEnds[silenceEnds.length - 1].split(': ')[1]);

      // Get total audio duration
      const getDuration = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        fullPath
      ]);

      let durationOutput = '';
      getDuration.stdout.on('data', (d) => { durationOutput += d.toString(); });
      getDuration.on('close', () => {
        const totalDuration = parseFloat(durationOutput.trim()) || 0;

        // Trailing silence is from lastSilenceStart to end of file
        // We use lastSilenceStart as the point where silence begins
        const trailingSilenceSeconds = totalDuration - lastSilenceStart;
        const trailingSilenceMs = Math.round(trailingSilenceSeconds * 1000);

        console.log(`  Trailing silence: ${trailingSilenceMs}ms (from ${lastSilenceStart.toFixed(3)}s to ${totalDuration.toFixed(3)}s)`);

        resolve(trailingSilenceMs);
      });

      getDuration.on('error', () => {
        resolve(0);
      });
    });

    detect.on('error', () => {
      console.error(`FFmpeg error for ${fullPath}`);
      resolve(0);
    });
  });
}

/**
 * Create backup of original audio file
 * Used when generating new TTS audio
 */
export async function createAudioBackup(audioPath: string): Promise<string | null> {
  let fullPath: string;
  if (audioPath.startsWith('/')) {
    fullPath = path.join(process.cwd(), 'public', audioPath.replace(/^\//, ''));
  } else {
    fullPath = audioPath;
  }
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`Audio file not found for backup: ${fullPath}`);
    return null;
  }

  // Check if backup already exists
  const backupPath = fullPath.replace('.mp3', '_backup.mp3');
  if (fs.existsSync(backupPath)) {
    console.log(`  Backup already exists: ${path.basename(backupPath)}`);
    return backupPath;
  }

  // Create backup
  try {
    fs.copyFileSync(fullPath, backupPath);
    console.log(`  Created backup: ${path.basename(backupPath)}`);
    return backupPath;
  } catch (err) {
    console.error(`Failed to create backup: ${err}`);
    return null;
  }
}

export function secondsToFrames(seconds: number, fps: number = 30): number {
  return Math.ceil(seconds * fps);
}

export function framesToSeconds(frames: number, fps: number = 30): number {
  return frames / fps;
}

/**
 * Audio speed analysis result
 * Contains information about audio playback characteristics
 */
export interface AudioSpeedAnalysis {
  /** Duration from file metadata (seconds) */
  metadataDuration: number;
  /** Estimated speech duration based on word count (seconds) */
  estimatedSpeechDuration: number;
  /** Calculated playback rate to normalize speed */
  recommendedPlaybackRate: number;
  /** Confidence level (0-1) of the speed detection */
  confidence: number;
  /** Reason for the recommended rate */
  reason: string;
}

/**
 * Analyze audio file to determine if playback speed adjustment is needed.
 *
 * This function:
 * 1. Gets the actual audio duration from metadata
 * 2. Estimates expected duration based on word count (average 160 words/minute for natural speech)
 * 3. Compares to detect if audio was generated at non-standard speed
 * 4. Returns recommended playback rate
 *
 * @param audioPath - Path to audio file
 * @param narrationText - Original narration text (for word count analysis)
 * @returns AudioSpeedAnalysis with recommended playback rate
 */
export async function analyzeAudioSpeed(
  audioPath: string,
  narrationText?: string
): Promise<AudioSpeedAnalysis> {
  // Get actual audio duration from file metadata
  const metadataDuration = await getAudioDuration(audioPath);

  // If no narration text provided, assume normal speed
  if (!narrationText || narrationText.trim().length === 0) {
    return {
      metadataDuration,
      estimatedSpeechDuration: metadataDuration,
      recommendedPlaybackRate: 1.0,
      confidence: 0,
      reason: 'No narration text provided, using default rate',
    };
  }

  // Estimate expected speech duration
  // Average speaking rate: 160 words per minute = 2.67 words per second
  // This is more realistic for conversational English
  const wordCount = narrationText.trim().split(/\s+/).length;
  const averageWordsPerSecond = 2.67;
  const estimatedSpeechDuration = wordCount / averageWordsPerSecond;

  // Calculate the speed ratio (how fast the audio is relative to expected)
  // If audio is SHORTER than expected, it was generated faster
  // If audio is LONGER than expected, it was generated slower
  const speedRatio = estimatedSpeechDuration / metadataDuration;

  // Determine recommended playback rate
  let recommendedPlaybackRate = 1.0;
  let reason = '';
  let confidence = 0;

  // Define thresholds for speed detection (more lenient)
  const NORMAL_SPEECH_RANGE = 0.85; // Within 15% of expected
  const FAST_SPEECH_THRESHOLD = 1.15; // 15% faster than expected
  const VERY_FAST_THRESHOLD = 1.30; // 30% faster than expected

  if (speedRatio > VERY_FAST_THRESHOLD) {
    // Audio is much faster than normal (e.g., rate="1.3" or higher)
    recommendedPlaybackRate = 1.0 / speedRatio;
    reason = `Audio generated at ~${(speedRatio * 100).toFixed(0)}% speed, applying playbackRate=${recommendedPlaybackRate.toFixed(3)} to normalize`;
    confidence = 0.9;
  } else if (speedRatio > FAST_SPEECH_THRESHOLD) {
    // Audio is faster than normal (e.g., rate="1.15" or similar)
    recommendedPlaybackRate = 1.0 / speedRatio;
    reason = `Audio generated at ~${(speedRatio * 100).toFixed(0)}% speed, applying playbackRate=${recommendedPlaybackRate.toFixed(3)} to normalize`;
    confidence = 0.75;
  } else if (speedRatio < (1 / VERY_FAST_THRESHOLD)) {
    // Audio is much slower than normal
    recommendedPlaybackRate = 1.0 / speedRatio;
    reason = `Audio generated at ~${(speedRatio * 100).toFixed(0)}% speed (slower), applying playbackRate=${recommendedPlaybackRate.toFixed(3)} to normalize`;
    confidence = 0.9;
  } else if (Math.abs(speedRatio - 1.0) <= NORMAL_SPEECH_RANGE) {
    // Audio is within normal range
    recommendedPlaybackRate = 1.0;
    reason = `Audio speed within normal range (ratio=${speedRatio.toFixed(3)}), using default playbackRate=1.0`;
    confidence = 0.6;
  } else {
    // Edge case: slightly off but acceptable
    recommendedPlaybackRate = 1.0;
    reason = `Audio speed acceptable (ratio=${speedRatio.toFixed(3)}), using default playbackRate=1.0`;
    confidence = 0.4;
  }

  // Sanity check: don't allow extreme playback rates
  const MIN_PLAYBACK_RATE = 0.5;
  const MAX_PLAYBACK_RATE = 2.0;
  recommendedPlaybackRate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, recommendedPlaybackRate));

  console.log(`[AudioSpeedAnalysis]`);
  console.log(`  Word count: ${wordCount}`);
  console.log(`  Estimated speech duration: ${estimatedSpeechDuration.toFixed(2)}s`);
  console.log(`  Actual audio duration: ${metadataDuration.toFixed(2)}s`);
  console.log(`  Speed ratio: ${speedRatio.toFixed(3)}`);
  console.log(`  Recommended playbackRate: ${recommendedPlaybackRate.toFixed(3)}`);
  console.log(`  Reason: ${reason}`);
  console.log(`  Confidence: ${(confidence * 100).toFixed(0)}%`);
  console.log('');

  return {
    metadataDuration,
    estimatedSpeechDuration,
    recommendedPlaybackRate,
    confidence,
    reason,
  };
}
