import { interpolate, useCurrentFrame, useVideoConfig, Easing, spring } from 'remotion';

type EffectType = 'kenBurns' | 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight' | 'panUp' | 'panDown' | 'spiral' | 'pulse' | 'drift';

interface SceneEffectProps {
  imageSrc: string;
  effectType?: EffectType;
  sceneDuration: number;
  sceneStartFrame: number;
}

export const SceneEffect: React.FC<SceneEffectProps> = ({ imageSrc, effectType = 'kenBurns', sceneDuration, sceneStartFrame }) => {
  const globalFrame = useCurrentFrame();
  const localFrame = globalFrame - sceneStartFrame;
  const { fps } = useVideoConfig();

  const midPoint = sceneDuration / 2;

  const renderEffect = () => {
    switch (effectType) {
      case 'kenBurns':
        return renderKenBurns();
      case 'zoomIn':
        return renderZoomIn();
      case 'zoomOut':
        return renderZoomOut();
      case 'panLeft':
        return renderPanLeft();
      case 'panRight':
        return renderPanRight();
      case 'panUp':
        return renderPanUp();
      case 'panDown':
        return renderPanDown();
      case 'spiral':
        return renderSpiral();
      case 'pulse':
        return renderPulse();
      case 'drift':
        return renderDrift();
      default:
        return renderKenBurns();
    }
  };

  const renderKenBurns = () => {
    const scale = interpolate(
      localFrame,
      [0, midPoint, sceneDuration],
      [1, 1.15, 1.05],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const translateX = interpolate(
      localFrame,
      [0, midPoint, sceneDuration],
      [0, 3, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const translateY = interpolate(
      localFrame,
      [0, midPoint, sceneDuration],
      [0, 2, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return { scale, translateX, translateY, rotation: 0 };
  };

  const renderZoomIn = () => {
    const scale = interpolate(
      localFrame,
      [0, sceneDuration],
      [1, 1.25],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return { scale, translateX: 0, translateY: 0, rotation: 0 };
  };

  const renderZoomOut = () => {
    const scale = interpolate(
      localFrame,
      [0, sceneDuration],
      [1.2, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return { scale, translateX: 0, translateY: 0, rotation: 0 };
  };

  const renderPanLeft = () => {
    const translateX = interpolate(
      localFrame,
      [0, midPoint, sceneDuration],
      [0, -5, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const scale = interpolate(
      localFrame,
      [0, sceneDuration],
      [1.1, 1.05],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return { scale, translateX, translateY: 0, rotation: 0 };
  };

  const renderPanRight = () => {
    const translateX = interpolate(
      localFrame,
      [0, midPoint, sceneDuration],
      [0, 5, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const scale = interpolate(
      localFrame,
      [0, sceneDuration],
      [1.1, 1.05],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return { scale, translateX, translateY: 0, rotation: 0 };
  };

  const renderPanUp = () => {
    const translateY = interpolate(
      localFrame,
      [0, midPoint, sceneDuration],
      [0, -4, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const scale = interpolate(
      localFrame,
      [0, sceneDuration],
      [1.1, 1.05],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return { scale, translateX: 0, translateY, rotation: 0 };
  };

  const renderPanDown = () => {
    const translateY = interpolate(
      localFrame,
      [0, midPoint, sceneDuration],
      [0, 4, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const scale = interpolate(
      localFrame,
      [0, sceneDuration],
      [1.1, 1.05],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return { scale, translateX: 0, translateY, rotation: 0 };
  };

  const renderSpiral = () => {
    const scale = interpolate(
      localFrame,
      [0, sceneDuration],
      [1, 1.15],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const rotation = interpolate(
      localFrame,
      [0, sceneDuration],
      [0, 5],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return { scale, translateX: 0, translateY: 0, rotation };
  };

  const renderPulse = () => {
    const pulseFrame = localFrame % (fps * 2);
    const scale = interpolate(
      pulseFrame,
      [0, fps, fps * 2],
      [1, 1.08, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return { scale, translateX: 0, translateY: 0, rotation: 0 };
  };

  const renderDrift = () => {
    const translateX = interpolate(
      localFrame,
      [0, sceneDuration * 0.25, sceneDuration * 0.5, sceneDuration * 0.75, sceneDuration],
      [0, 3, 0, -3, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const translateY = interpolate(
      localFrame,
      [0, sceneDuration * 0.33, sceneDuration * 0.66, sceneDuration],
      [0, -2, 2, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const scale = interpolate(
      localFrame,
      [0, sceneDuration],
      [1.05, 1.1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return { scale, translateX, translateY, rotation: 0 };
  };

  const { scale, translateX, translateY, rotation } = renderEffect();

  const brightness = interpolate(
    localFrame,
    [0, Math.min(fps * 2, sceneDuration * 0.1)],
    [0.85, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const vignette = interpolate(
    localFrame,
    [0, sceneDuration * 0.9, sceneDuration],
    [0, 0.35, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

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
          filter: `brightness(${brightness})`,
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

export const getRandomEffect = (): EffectType => {
  const effects: EffectType[] = ['kenBurns', 'zoomIn', 'zoomOut', 'panLeft', 'panRight', 'panUp', 'panDown', 'spiral', 'pulse', 'drift'];
  return effects[Math.floor(Math.random() * effects.length)];
};
