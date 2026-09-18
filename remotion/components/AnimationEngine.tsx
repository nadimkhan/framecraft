import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { AnimationType } from '../types';

interface AnimationEngineProps {
  imageSrc: string;
  animationType: AnimationType;
  sceneDuration: number;
  sceneStartFrame: number;
}

export const AnimationEngine: React.FC<AnimationEngineProps> = ({
  imageSrc,
  animationType,
  sceneDuration,
  sceneStartFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  console.log(`[AnimationEngine] frame=${frame}, duration=${sceneDuration}, animType=${animationType}`);

  const midPoint = sceneDuration / 2;
  const third = sceneDuration / 3;
  const quarter = sceneDuration / 4;

  const computeAnimation = () => {
    switch (animationType) {
      case 'none': {
        return { 
          scale: 1, 
          translateX: 0, 
          translateY: 0, 
          rotation: 0,
          opacity: 1 
        };
      }

      case 'zoom-in': {
        const scale = interpolate(
          frame,
          [0, sceneDuration],
          [1, 1.25],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX: 0, translateY: 0, rotation: 0, opacity: 1 };
      }

      case 'zoom-out': {
        const scale = interpolate(
          frame,
          [0, sceneDuration],
          [1.2, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX: 0, translateY: 0, rotation: 0, opacity: 1 };
      }

      case 'pan-left': {
        const translateX = interpolate(
          frame,
          [0, midPoint, sceneDuration],
          [0, -4, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const scale = interpolate(
          frame,
          [0, sceneDuration],
          [1.1, 1.05],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX, translateY: 0, rotation: 0, opacity: 1 };
      }

      case 'pan-right': {
        const translateX = interpolate(
          frame,
          [0, midPoint, sceneDuration],
          [0, 4, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const scale = interpolate(
          frame,
          [0, sceneDuration],
          [1.1, 1.05],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX, translateY: 0, rotation: 0, opacity: 1 };
      }

      case 'pan-up': {
        const translateY = interpolate(
          frame,
          [0, midPoint, sceneDuration],
          [0, -4, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const scale = interpolate(
          frame,
          [0, sceneDuration],
          [1.08, 1.05],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX: 0, translateY, rotation: 0, opacity: 1 };
      }

      case 'pan-down': {
        const translateY = interpolate(
          frame,
          [0, midPoint, sceneDuration],
          [0, 4, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const scale = interpolate(
          frame,
          [0, sceneDuration],
          [1.08, 1.05],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX: 0, translateY, rotation: 0, opacity: 1 };
      }

      case 'slow-scale-rotate': {
        const scale = interpolate(
          frame,
          [0, midPoint, sceneDuration],
          [1, 1.12, 1.05],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const rotation = interpolate(
          frame,
          [0, sceneDuration],
          [0, 3],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX: 0, translateY: 0, rotation, opacity: 1 };
      }

      case 'parallax-layer': {
        const scale = interpolate(
          frame,
          [0, midPoint, sceneDuration],
          [1, 1.15, 1.08],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const translateX = interpolate(
          frame,
          [0, midPoint, sceneDuration],
          [0, 3, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const translateY = interpolate(
          frame,
          [0, midPoint, sceneDuration],
          [0, 2, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX, translateY, rotation: 0, opacity: 1 };
      }

      case 'subtle-float': {
        const translateX = interpolate(
          frame,
          [0, third, 2 * third, sceneDuration],
          [0, 2, -2, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const translateY = interpolate(
          frame,
          [0, third, 2 * third, sceneDuration],
          [0, -2, 2, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const scale = interpolate(
          frame,
          [0, sceneDuration],
          [1.02, 1.08],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX, translateY, rotation: 0, opacity: 1 };
      }

      case 'cinematic-push': {
        const scale = interpolate(
          frame,
          [0, sceneDuration],
          [1.05, 1.2],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const translateY = interpolate(
          frame,
          [0, sceneDuration],
          [0, 3],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX: 0, translateY, rotation: 0, opacity: 1 };
      }

      // ===== NEW ANIMATIONS =====
      
      case 'ken-burns': {
        // Classic Ken Burns: slow zoom in + pan across
        const scale = interpolate(
          frame,
          [0, midPoint, sceneDuration],
          [1, 1.1, 1.2],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const translateX = interpolate(
          frame,
          [0, midPoint, sceneDuration],
          [-3, 0, 3],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const translateY = interpolate(
          frame,
          [0, midPoint, sceneDuration],
          [1, 0, -1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX, translateY, rotation: 0, opacity: 1 };
      }

      case 'spiral-zoom': {
        // Spiral effect: zoom + rotation
        const scale = interpolate(
          frame,
          [0, sceneDuration],
          [1, 1.18],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const rotation = interpolate(
          frame,
          [0, midPoint, sceneDuration],
          [0, 5, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX: 0, translateY: 0, rotation, opacity: 1 };
      }

      case 'pulse-breathe': {
        // Breathing/pulsing effect
        const cycle = frame % (fps * 3); // 3 second cycle
        const pulseScale = interpolate(
          cycle,
          [0, fps * 1.5, fps * 3],
          [1, 1.06, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const baseScale = interpolate(
          frame,
          [0, sceneDuration],
          [1, 1.08],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { 
          scale: baseScale * pulseScale, 
          translateX: 0, 
          translateY: 0, 
          rotation: 0, 
          opacity: 1 
        };
      }

      case 'drift-diagonal': {
        // Diagonal drift movement
        const translateX = interpolate(
          frame,
          [0, quarter, midPoint, 3 * quarter, sceneDuration],
          [0, -2, -1, -3, -2],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const translateY = interpolate(
          frame,
          [0, quarter, midPoint, 3 * quarter, sceneDuration],
          [0, 2, 1, 3, 2],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const scale = interpolate(
          frame,
          [0, sceneDuration],
          [1.05, 1.12],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX, translateY, rotation: 0, opacity: 1 };
      }

      case 'focus-pull': {
        // Focus pull: start wide, zoom in, then zoom out
        const scale = interpolate(
          frame,
          [0, midPoint, sceneDuration],
          [1.15, 1.25, 1.1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const brightness = interpolate(
          frame,
          [0, midPoint, sceneDuration],
          [0.95, 1, 0.95],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX: 0, translateY: 0, rotation: 0, opacity: 1, brightness };
      }

      case 'orbit-light': {
        // Orbital light movement (simulated with position)
        const angle = interpolate(
          frame,
          [0, sceneDuration],
          [0, Math.PI * 0.3],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const translateX = Math.sin(angle) * 4;
        const translateY = Math.cos(angle) * 2;
        const scale = interpolate(
          frame,
          [0, sceneDuration],
          [1.08, 1.12],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX, translateY, rotation: 0, opacity: 1 };
      }

      default: {
        const scale = interpolate(
          frame,
          [0, midPoint, sceneDuration],
          [1, 1.15, 1.05],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return { scale, translateX: 0, translateY: 0, rotation: 0, opacity: 1 };
      }
    }
  };

  const { scale, translateX, translateY, rotation, opacity, brightness: animBrightness } = computeAnimation();

  const vignette = interpolate(
    frame,
    [0, sceneDuration * 0.9, sceneDuration],
    [0, 0.35, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const baseBrightness = interpolate(
    frame,
    [0, Math.min(fps * 2, sceneDuration * 0.1)],
    [0.9, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const finalBrightness = animBrightness ? baseBrightness * animBrightness : baseBrightness;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'absolute',
        top: 0,
        left: 0,
        backgroundColor: '#000',
      }}
    >
      <img
        src={imageSrc}
        alt="Scene"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale}) translate(${translateX}%, ${translateY}%) rotate(${rotation}deg)`,
          opacity,
          filter: `brightness(${finalBrightness})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `radial-gradient(circle, transparent 35%, rgba(0,0,0,${vignette}) 100%)`,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

export const getAnimationType = (index: number): AnimationType => {
  const types: AnimationType[] = [
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
  return types[index % types.length];
};
