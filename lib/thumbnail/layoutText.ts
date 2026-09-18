import { THUMBNAIL_CONFIG } from './constants';

export interface TextLayoutResult {
  lines: string[];
  fontSize: number;
  width: number;
  height: number;
}

const FONT_SIZE_MULTIPLIER = 0.55;

function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * FONT_SIZE_MULTIPLIER;
}

function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + ' ' + words[i];
    const width = estimateTextWidth(testLine, fontSize);

    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

export function calculateTextLayout(
  text: string,
  availableWidth: number,
  availableHeight: number
): TextLayoutResult {
  const { TEXT } = THUMBNAIL_CONFIG;
  
  let fontSize = TEXT.INITIAL_FONT_SIZE;
  let lines: string[] = [];
  
  while (fontSize >= TEXT.MIN_FONT_SIZE) {
    lines = wrapText(text, availableWidth, fontSize);
    
    const lineHeight = fontSize * TEXT.LINE_HEIGHT;
    const totalHeight = lines.length * lineHeight;
    
    if (totalHeight <= availableHeight) {
      break;
    }
    
    fontSize -= 5;
  }
  
  const lineHeight = fontSize * TEXT.LINE_HEIGHT;
  const maxLineWidth = Math.max(...lines.map(line => 
    estimateTextWidth(line, fontSize)
  ));
  
  return {
    lines,
    fontSize,
    width: maxLineWidth,
    height: lines.length * lineHeight,
  };
}

export interface TextPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function calculateTextPosition(
  layout: TextLayoutResult,
  canvasWidth: number,
  canvasHeight: number
): TextPosition {
  const { ACCENT_LINE } = THUMBNAIL_CONFIG;
  
  const startX = 80;
  const startY = (canvasHeight - layout.height) / 2;
  
  return {
    x: startX + ACCENT_LINE.WIDTH + ACCENT_LINE.SPACING_FROM_TEXT,
    y: startY,
    width: layout.width,
    height: layout.height,
  };
}

export interface AccentLinePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function calculateAccentLinePosition(
  textPosition: TextPosition,
  textLayout: TextLayoutResult
): AccentLinePosition {
  const { ACCENT_LINE } = THUMBNAIL_CONFIG;
  
  return {
    x: textPosition.x - ACCENT_LINE.SPACING_FROM_TEXT - ACCENT_LINE.WIDTH,
    y: textPosition.y,
    width: ACCENT_LINE.WIDTH,
    height: textLayout.height,
  };
}
