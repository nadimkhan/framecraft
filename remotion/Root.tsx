import { Composition, getInputProps } from 'remotion';
import { VideoCompositionProps, VIDEO_CONFIG } from './types';
import { Video } from './Video';

export const RemotionRoot: React.FC = () => {
  const rawProps = getInputProps();
  const inputProps = rawProps as unknown as VideoCompositionProps;

  const scenes = inputProps?.scenes || [];
  
  // Get custom width/height from props, fallback to VIDEO_CONFIG
  const width = inputProps?.width || VIDEO_CONFIG.width;
  const height = inputProps?.height || VIDEO_CONFIG.height;
  
  // Calculate total duration from scenes using the timeline model
  // Total = last scene's endFrame (not sum of all durations due to overlaps)
  const totalDuration = scenes.length > 0 
    ? Math.max(...scenes.map(s => s.endFrame))
    : VIDEO_CONFIG.fps * 10;
  
  const durationInFrames = totalDuration > 0 ? totalDuration : VIDEO_CONFIG.fps * 10;

  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    console.log('[RemotionRoot] Duration:', durationInFrames, 'frames');
    console.log('[RemotionRoot] Scenes:', scenes.length);
    console.log('[RemotionRoot] Resolution:', width, 'x', height);
  }

  return (
    <Composition
      id="Video"
      component={Video}
      fps={VIDEO_CONFIG.fps}
      width={width}
      height={height}
      durationInFrames={durationInFrames}
      defaultProps={{
        scenes: [],
        outputFilename: 'output.mp4',
      } as VideoCompositionProps}
    />
  );
};
