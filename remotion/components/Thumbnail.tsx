import { Img, useVideoConfig, AbsoluteFill, useCurrentFrame } from 'remotion';
import { VIDEO_CONFIG } from '../types';

interface ThumbnailProps {
  title: string;
  backgroundImageSrc: string;
  durationInFrames: number;
}

export const Thumbnail: React.FC<ThumbnailProps> = ({
  title,
  backgroundImageSrc,
  durationInFrames,
}) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  
  // Select a frame from the middle of the video as "best frame"
  const bestFrame = Math.floor(durationInFrames * 0.5);
  const showThumbnail = frame < 30; // Show for first 1 second
  
  const config = VIDEO_CONFIG.thumbnail;
  
  if (!showThumbnail) {
    return null;
  }

  return (
    <AbsoluteFill style={{ zIndex: 50 }}>
      {/* Background image */}
      <Img
        src={backgroundImageSrc}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
      
      {/* Dark overlay for readability */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
        }}
      />
      
      {/* Title - left aligned, vertically centered */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: config.padding,
          right: config.padding,
          transform: 'translateY(-50%)',
          fontFamily: `"${config.fontFamily}", sans-serif`,
          fontSize: config.fontSize,
          fontWeight: config.fontWeight,
          color: config.textColor,
          textAlign: config.textAlign,
          lineHeight: 1.2,
          ...(config.shadow && {
            textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
          }),
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};
