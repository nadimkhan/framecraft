import { Img } from 'remotion';
import { VIDEO_CONFIG } from '../types';

interface LogoProps {
  customLogoSrc?: string;
  baseUrl?: string;
}

export const Logo: React.FC<LogoProps> = ({ customLogoSrc, baseUrl }) => {
  const logoSrcRelative = customLogoSrc || VIDEO_CONFIG.logo.src;
  
  // Use provided baseUrl if available, otherwise use relative path
  // But check if it looks like a full URL - if not and no baseUrl, skip
  const isFullUrl = logoSrcRelative.startsWith('http');
  
  if (!baseUrl && !isFullUrl) {
    // Skip logo if no baseUrl and not a full URL (avoids loading from wrong server)
    console.log('[Logo] Skipping - no baseUrl provided');
    return null;
  }
  
  const logoSrc = baseUrl ? `${baseUrl}${logoSrcRelative}` : logoSrcRelative;

  console.log('[Logo] Loading from:', logoSrc);

  const { x, y } = VIDEO_CONFIG.logo.position;
  const width = VIDEO_CONFIG.logo.width;
  const opacity = VIDEO_CONFIG.logo.opacity;

  return (
    <div
      style={{
        position: 'absolute',
        top: y,
        left: x,
        zIndex: 100,
      }}
    >
      <Img
        src={logoSrc}
        style={{
          width,
          height: 'auto',
          opacity,
        }}
        alt="Logo"
      />
    </div>
  );
};
