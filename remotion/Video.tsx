import { AbsoluteFill, Sequence } from 'remotion';
import { TimelineSceneData, VIDEO_CONFIG } from './types';
import { Scene } from './components/Scene';
import { BackgroundMusic } from './components/BackgroundMusic';
import { Logo } from './components/Logo';
import { Thumbnail } from './components/Thumbnail';

interface VideoProps {
  scenes?: TimelineSceneData[];
  musicSrc?: string;
  title?: string;
  thumbnailImageSrc?: string;
  baseUrl?: string;
  narrationPositionBottom?: string;
}

export const Video: React.FC<VideoProps> = ({ 
  scenes = [], 
  musicSrc,
  title,
  thumbnailImageSrc,
  baseUrl,
  narrationPositionBottom,
}) => {
  // Calculate total duration from last scene's endFrame
  const totalDurationInFrames = scenes.length > 0 
    ? Math.max(...scenes.map(s => s.endFrame))
    : VIDEO_CONFIG.fps * 10;

  // Debug log timeline
  console.log('[Video] Rendering', scenes.length, 'scenes');
  console.log('[Video] Total duration:', totalDurationInFrames, 'frames');

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Thumbnail overlay (first 1 second) */}
      {title && thumbnailImageSrc && (
        <Thumbnail 
          title={title}
          backgroundImageSrc={thumbnailImageSrc}
          durationInFrames={totalDurationInFrames}
        />
      )}
      
      {/* 
        Each scene is wrapped in a Sequence with absolute frame positioning.
        This ensures deterministic timeline where every frame is accounted for.
      */}
      {scenes.map((scene, index) => {
        const isLastScene = index === scenes.length - 1;
        const nextScene = scenes[index + 1];
        
        console.log(`[Video] === Scene ${index} ===`);
        console.log(`  ID: ${scene.id}`);
        console.log(`  startFrame: ${scene.startFrame}`);
        console.log(`  durationInFrames: ${scene.durationInFrames}`);
        console.log(`  endFrame: ${scene.endFrame}`);
        console.log(`  animationType: ${scene.animationType}`);
        console.log(`  wipeDirection: ${scene.wipeDirection}`);
        console.log(`  transitionOverlap: ${scene.transitionOverlap}`);
        console.log(`  audioSrc: ${scene.audioSrc}`);
        console.log(`  narration: ${scene.narration?.substring(0, 50)}...`);

        // Get the recommended playback rate from speed analysis (default to 1.0 if not available)
        const playbackRate = scene.speedAnalysis?.recommendedPlaybackRate ?? 1.0;

        return (
          <Sequence
            key={`scene-${scene.id}`}
            from={scene.startFrame}
            durationInFrames={scene.durationInFrames}
          >
            <Scene
              imageSrc={scene.imageSrc}
              audioSrc={scene.audioSrc}
              narration={scene.narration}
              sceneIndex={index}
              nextImageSrc={nextScene?.imageSrc}
              isLastScene={isLastScene}
              sceneDuration={scene.durationInFrames}
              sceneStartFrame={scene.startFrame}
              transitionOverlap={scene.transitionOverlap}
              animationType={scene.animationType}
              wipeDirection={scene.wipeDirection}
              playbackRate={playbackRate}
              narrationPositionBottom={scene.narrationPositionBottom || narrationPositionBottom}
            />
          </Sequence>
        );
      })}
      
      {/* Logo overlay - spans entire video */}
      <Logo baseUrl={baseUrl} />
      
      {/* Background music spans entire video */}
      {musicSrc && (
        <BackgroundMusic 
          src={musicSrc} 
          totalDuration={totalDurationInFrames}
        />
      )}
    </AbsoluteFill>
  );
};
