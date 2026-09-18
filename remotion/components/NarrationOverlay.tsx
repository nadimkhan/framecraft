import { interpolate, useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion';

interface NarrationOverlayProps {
  narration: string;
  sceneDuration: number;
  sceneStartFrame: number;
  positionBottom?: string;
}

function splitIntoPhrases(narration: string): string[] {
  const sentences = narration.match(/[^.!?]+[.!?]+/g) || [narration];
  return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

export const NarrationOverlay: React.FC<NarrationOverlayProps> = ({ narration, sceneDuration, sceneStartFrame, positionBottom = '15%' }) => {
  // useCurrentFrame() already returns Sequence-relative frame when inside <Sequence>
  // DO NOT subtract sceneStartFrame
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Debug logging
  console.log(`[NarrationOverlay] frame=${frame}, duration=${sceneDuration}, startFrame=${sceneStartFrame}`);
  
  const phrases = splitIntoPhrases(narration);
  const framesPerPhrase = Math.floor(sceneDuration / phrases.length);
  
  const currentPhraseIndex = Math.min(
    Math.floor(frame / framesPerPhrase),
    phrases.length - 1
  );
  
  const phraseStartFrame = currentPhraseIndex * framesPerPhrase;
  const phraseProgress = (frame - phraseStartFrame) / framesPerPhrase;
  
  const fadeIn = interpolate(phraseProgress, [0, 0.1], [0, 1], { extrapolateLeft: 'clamp' });
  const fadeOut = interpolate(phraseProgress, [0.85, 1], [1, 0], { extrapolateRight: 'clamp' });
  const opacity = Math.min(fadeIn, fadeOut);
  
  const scale = interpolate(phraseProgress, [0, 0.1, 0.5, 0.9, 1], [0.95, 1, 1, 1, 0.95], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  
  const translateY = interpolate(phraseProgress, [0, 0.1, 0.9, 1], [10, 0, 0, 10], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  
  const currentPhrase = phrases[currentPhraseIndex] || '';
  const upperText = currentPhrase.toUpperCase();

  return (
    <>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
        `}
      </style>
      <AbsoluteFill
        style={{
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingBottom: positionBottom,
        }}
      >
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            padding: '20px 40px',
            borderRadius: '12px',
            maxWidth: '85%',
            opacity,
            transform: `translateY(${translateY}px) scale(${scale})`,
          }}
        >
          <p
            style={{
              color: '#fff',
              fontSize: 42,
              fontFamily: '"Bebas Neue", sans-serif',
              fontWeight: 400,
              textAlign: 'center',
              margin: 0,
              lineHeight: 1.3,
              letterSpacing: '2px',
              textShadow: '0 2px 20px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.4)',
            }}
          >
            {upperText}
          </p>
        </div>
      </AbsoluteFill>
    </>
  );
};
