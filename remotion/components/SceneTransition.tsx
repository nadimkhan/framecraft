import { AbsoluteFill, useCurrentFrame, useVideoConfig, Easing } from 'remotion';

type TransitionType = 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 'zoomIn' | 'zoomOut' | 'pixelate' | 'fade' | 'parallax';

interface SceneTransitionProps {
  type?: TransitionType;
  duration?: number;
  nextImageSrc?: string;
}

export const SceneTransition: React.FC<SceneTransitionProps> = ({
  type = 'slideLeft',
  duration = 20,
  nextImageSrc,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const progress = Math.min(frame / duration, 1);
  const easedProgress = Easing.out(Easing.cubic)(progress);

  const getStyle = () => {
    switch (type) {
      case 'slideLeft': {
        const x = width * (1 - easedProgress);
        return { transform: `translateX(${x}px)`, opacity: 1, filter: 'none' };
      }
      case 'slideRight': {
        const x = -width * (1 - easedProgress);
        return { transform: `translateX(${x}px)`, opacity: 1, filter: 'none' };
      }
      case 'slideUp': {
        const y = height * (1 - easedProgress);
        return { transform: `translateY(${y}px)`, opacity: 1, filter: 'none' };
      }
      case 'slideDown': {
        const y = -height * (1 - easedProgress);
        return { transform: `translateY(${y}px)`, opacity: 1, filter: 'none' };
      }
      case 'zoomIn': {
        const scale = 0.8 + 0.2 * easedProgress;
        return { transform: `scale(${scale})`, opacity: easedProgress, filter: 'none' };
      }
      case 'zoomOut': {
        const scale = 1.2 - 0.2 * easedProgress;
        return { transform: `scale(${scale})`, opacity: easedProgress, filter: 'none' };
      }
      case 'pixelate': {
        const blur = 50 * (1 - easedProgress);
        return { transform: 'scale(1)', opacity: easedProgress, filter: blur > 1 ? `blur(${blur}px)` : 'none' };
      }
      case 'parallax': {
        const scale = 1.1 - 0.1 * easedProgress;
        const x = 5 * (1 - easedProgress);
        const y = 3 * (1 - easedProgress);
        return { transform: `scale(${scale}) translate(${x}%, ${y}%)`, opacity: easedProgress, filter: 'none' };
      }
      case 'fade':
      default:
        return { transform: 'scale(1)', opacity: easedProgress, filter: 'none' };
    }
  };

  const style = getStyle();

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {nextImageSrc && (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          <img
            src={nextImageSrc}
            alt="Next scene"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: style.transform,
              opacity: style.opacity,
              filter: style.filter,
            }}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};

export const getTransitionType = (index: number): TransitionType => {
  const transitions: TransitionType[] = ['parallax', 'slideLeft', 'slideRight', 'zoomIn', 'zoomOut', 'fade'];
  return transitions[index % transitions.length];
};
