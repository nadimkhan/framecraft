import { Audio, AbsoluteFill, useCurrentFrame, interpolate, Easing, useVideoConfig } from 'remotion';
import { AnimationEngine } from './AnimationEngine';
import { NarrationOverlay } from './NarrationOverlay';
import { AnimationType, TransitionType, WipeDirection } from '../types';

interface SceneProps {
  imageSrc: string;
  audioSrc: string;
  narration?: string;
  sceneIndex: number;
  nextImageSrc?: string;
  isLastScene: boolean;
  sceneDuration: number;
  sceneStartFrame: number;
  transitionOverlap: number;
  animationType: AnimationType;
  transitionType?: TransitionType;
  wipeDirection?: WipeDirection;
  playbackRate?: number;
  narrationPositionBottom?: string;
}

// Get wipe direction that alternates based on scene index
export const getWipeDirection = (index: number): WipeDirection => {
  const directions: WipeDirection[] = ['right', 'left', 'up', 'down'];
  return directions[index % directions.length];
};

export const Scene: React.FC<SceneProps> = ({
  imageSrc,
  audioSrc,
  narration,
  sceneIndex,
  nextImageSrc,
  isLastScene,
  sceneDuration,
  sceneStartFrame,
  transitionOverlap,
  animationType,
  transitionType,
  wipeDirection,
  playbackRate = 1.0,
  narrationPositionBottom,
}) => {
  const frame = useCurrentFrame();

  const activeWipeDirection = wipeDirection || getWipeDirection(sceneIndex);
  const transitionStartFrame = sceneDuration - transitionOverlap;

  const isDuringTransition = !isLastScene &&
    transitionOverlap > 0 &&
    frame >= transitionStartFrame &&
    frame < sceneDuration;

  const transitionProgress = isDuringTransition
    ? (frame - transitionStartFrame) / transitionOverlap
    : 0;

  // Smooth easing
  const easedProgress = interpolate(
    transitionProgress,
    [0, 1],
    [0, 1],
    { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ===== OUTGOING SCENE - Soft wipe =====
  const getOutgoingStyles = (progress: number, direction: WipeDirection): React.CSSProperties => {
    const p = progress;

    switch (direction) {
      case 'right':
        return {
          transform: 'scale(1)',
          opacity: 1,
          filter: `brightness(${1 - p * 0.2})`,
          clipPath: `inset(0 ${p * 100}% 0 0)`,
        };
      case 'left':
        return {
          transform: 'scale(1)',
          opacity: 1,
          filter: `brightness(${1 - p * 0.2})`,
          clipPath: `inset(0 0 0 ${p * 100}%)`,
        };
      case 'up':
        return {
          transform: 'scale(1)',
          opacity: 1,
          filter: `brightness(${1 - p * 0.2})`,
          clipPath: `inset(${p * 100}% 0 0 0)`,
        };
      case 'down':
        return {
          transform: 'scale(1)',
          opacity: 1,
          filter: `brightness(${1 - p * 0.2})`,
          clipPath: `inset(0 0 ${p * 100}% 0)`,
        };
    }
  };

  // ===== INCOMING SCENE - Soft wipe from opposite direction =====
  const getIncomingStyles = (progress: number, direction: WipeDirection): React.CSSProperties => {
    const p = progress;

    switch (direction) {
      case 'right':
        return {
          transform: 'scale(1)',
          opacity: 1,
          filter: `brightness(${0.8 + p * 0.2})`,
          clipPath: `inset(0 0 0 ${(1 - p) * 100}%)`,
        };
      case 'left':
        return {
          transform: 'scale(1)',
          opacity: 1,
          filter: `brightness(${0.8 + p * 0.2})`,
          clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
        };
      case 'up':
        return {
          transform: 'scale(1)',
          opacity: 1,
          filter: `brightness(${0.8 + p * 0.2})`,
          clipPath: `inset(0 0 ${(1 - p) * 100}% 0)`,
        };
      case 'down':
        return {
          transform: 'scale(1)',
          opacity: 1,
          filter: `brightness(${0.8 + p * 0.2})`,
          clipPath: `inset(${(1 - p) * 100}% 0 0 0)`,
        };
    }
  };

  const outgoingStyles = isDuringTransition
    ? getOutgoingStyles(easedProgress, activeWipeDirection)
    : { opacity: 1, transform: 'scale(1)', filter: 'none', clipPath: 'inset(0 0 0 0)' };

  const incomingStyles = isDuringTransition
    ? getIncomingStyles(easedProgress, activeWipeDirection)
    : {};

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Current scene with animation */}
      <AbsoluteFill style={{ ...outgoingStyles }}>
        <AnimationEngine
          imageSrc={imageSrc}
          animationType={animationType}
          sceneDuration={sceneDuration}
          sceneStartFrame={sceneStartFrame}
        />
      </AbsoluteFill>

      {/* Next scene overlay during transition */}
      {!isLastScene && nextImageSrc && isDuringTransition && (
        <AbsoluteFill style={{ ...incomingStyles }}>
          <img
            src={nextImageSrc}
            alt="Next scene"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </AbsoluteFill>
      )}

      {/* Audio plays for entire scene duration — always at 1.0 for consistent speed */}
      <Audio src={audioSrc} playbackRate={1.0} />

      {/* Narration overlay */}
      {narration && (
        <NarrationOverlay
          narration={narration}
          sceneDuration={sceneDuration}
          sceneStartFrame={sceneStartFrame}
          positionBottom={narrationPositionBottom}
        />
      )}
    </AbsoluteFill>
  );
};
