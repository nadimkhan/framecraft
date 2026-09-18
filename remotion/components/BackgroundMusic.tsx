import { Audio, interpolate, useCurrentFrame } from 'remotion';
import { VIDEO_CONFIG } from '../types';

interface BackgroundMusicProps {
  src: string;
  totalDuration: number;
}

export const BackgroundMusic: React.FC<BackgroundMusicProps> = ({ src, totalDuration }) => {
  const frame = useCurrentFrame();

  // Use totalDuration for fade calculations
  const fadeInEnd = VIDEO_CONFIG.musicFadeIn;
  const fadeOutStart = Math.max(0, totalDuration - VIDEO_CONFIG.musicFadeOut);

  // Volume interpolation:
  // - Frame 0 to fadeInEnd: volume goes from 0 to musicVolume
  // - Frame fadeInEnd to fadeOutStart: volume stays at musicVolume  
  // - Frame fadeOutStart to totalDuration: volume goes from musicVolume to 0
  const volume = interpolate(
    frame,
    [0, fadeInEnd, fadeOutStart, totalDuration],
    [0, VIDEO_CONFIG.musicVolume, VIDEO_CONFIG.musicVolume, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Debug logging
  if (process.env.NODE_ENV === 'development' && frame === 0) {
    console.log(`[BackgroundMusic] totalDuration: ${totalDuration}, fadeIn: ${fadeInEnd}, fadeOutStart: ${fadeOutStart}`);
  }

  return <Audio src={src} volume={volume} />;
};
