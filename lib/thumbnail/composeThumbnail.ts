import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { THUMBNAIL_CONFIG_SHORT, THUMBNAIL_CONFIG_LONG } from './constants';
import { calculateTextLayout } from './layoutText';
import { createCanvas, loadImage, registerFont } from 'canvas';

// Use the appropriate config based on video type
// eslint-disable-next-line @typescript/no-explicit-any
let THUMBNAIL_CONFIG: any = THUMBNAIL_CONFIG_SHORT;

// Register the Bebas Neue font
const fontPath = path.join(process.cwd(), 'public', 'fonts', 'BebasNeue-Regular.ttf');
if (fs.existsSync(fontPath)) {
  registerFont(fontPath, { family: 'Bebas Neue' });
  console.log('[composeThumbnail] Registered font: Bebas Neue');
} else {
  console.warn('[composeThumbnail] Font not found:', fontPath);
}

// Define accent line colors
const ACCENT_COLORS = [
  '#2563EB', // Electric Blue
  '#EF4444', // Red
  '#10B981', // Emerald Green
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
];

// Helper function to get random accent color
function getRandomAccentColor(): string {
  const randomIndex = Math.floor(Math.random() * ACCENT_COLORS.length);
  return ACCENT_COLORS[randomIndex];
}

export function setThumbnailConfig(isLongForm: boolean): void {
  THUMBNAIL_CONFIG = isLongForm ? THUMBNAIL_CONFIG_LONG : THUMBNAIL_CONFIG_SHORT;
  console.log(`[composeThumbnail] Using ${isLongForm ? '16:9' : '9:16'} config`);
}

export interface ComposeThumbnailOptions {
  baseImagePath: string;
  outputPath: string;
  title: string;
  logoPath?: string;
  isLongForm?: boolean;
}

export interface ComposeThumbnailResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

// Helper function to measure text width accurately using canvas
function measureTextWidth(text: string, fontSize: number, fontFamily: string = 'Bebas Neue'): number {
  const canvas = createCanvas(100, 100);
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px ${fontFamily}`;
  const metrics = ctx.measureText(text);
  return metrics.width;
}

// Improved text wrapping with accurate width measurement
// Wraps by character count (max chars per line based on aspect ratio) but completes words
function wrapTextAccurately(
  text: string,
  maxWidth: number,
  fontSize: number,
  isLongForm: boolean = false
): string[] {
  const maxCharsPerLine = isLongForm ? 36 : 24; // More chars for wider 16:9 canvas
  const lines: string[] = [];
  const words = text.split(' ');
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? currentLine + ' ' + word : word;

    // Check if adding this word would exceed max characters
    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      // Current line would exceed max chars
      if (currentLine) {
        lines.push(currentLine);
      }

      // If the word itself is longer than maxCharsPerLine, we need to split it
      if (word.length > maxCharsPerLine) {
        // Split the word across multiple lines
        let remainingWord = word;
        while (remainingWord.length > 0) {
          const chunk = remainingWord.substring(0, maxCharsPerLine);
          lines.push(chunk);
          remainingWord = remainingWord.substring(maxCharsPerLine);
        }
        currentLine = '';
      } else {
        currentLine = word;
      }
    }
  }

  // Add the last line if it exists
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

// Improved text layout calculation with accurate measurements
export function calculateTextLayoutAccurate(
  text: string,
  availableWidth: number,
  availableHeight: number,
  isLongForm: boolean = false
): { lines: string[]; fontSize: number; width: number; height: number } {
  const { TEXT } = THUMBNAIL_CONFIG;

  let fontSize = TEXT.INITIAL_FONT_SIZE;
  let lines: string[] = [];

  while (fontSize >= TEXT.MIN_FONT_SIZE) {
    lines = wrapTextAccurately(text, availableWidth, fontSize, isLongForm);

    const lineHeight = fontSize * TEXT.LINE_HEIGHT;
    const totalHeight = lines.length * lineHeight;

    if (totalHeight <= availableHeight) {
      break;
    }

    fontSize -= 5;
  }

  const lineHeight = fontSize * TEXT.LINE_HEIGHT;
  const maxLineWidth = Math.max(...lines.map(line =>
    measureTextWidth(line, fontSize)
  ));

  return {
    lines,
    fontSize,
    width: maxLineWidth,
    height: lines.length * lineHeight,
  };
}

export async function composeThumbnail(
  options: ComposeThumbnailOptions
): Promise<ComposeThumbnailResult> {
  const { baseImagePath, outputPath, title, logoPath, isLongForm = false } = options;

  // Set the correct config based on video type
  THUMBNAIL_CONFIG = isLongForm ? THUMBNAIL_CONFIG_LONG : THUMBNAIL_CONFIG_SHORT;
  
  try {
    if (!fs.existsSync(baseImagePath)) {
      return {
        success: false,
        error: `Base image not found: ${baseImagePath}`,
      };
    }

    const { CANVAS_WIDTH, CANVAS_HEIGHT, LOGO, TEXT } = THUMBNAIL_CONFIG;

    // Create canvas
    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Load and draw the base image
    const baseImage = await loadImage(baseImagePath);
    ctx.drawImage(baseImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Calculate text layout with accurate measurements
    // Text area: 10% from left to 10% from right
    const textAreaStartX = Math.round(CANVAS_WIDTH * 0.1);
    const textAreaEndX = Math.round(CANVAS_WIDTH * 0.9);
    const availableWidth = textAreaEndX - textAreaStartX;
    const availableHeight = CANVAS_HEIGHT * 0.5; // Use 50% of height for text
    const textLayout = calculateTextLayoutAccurate(title, availableWidth, availableHeight, isLongForm);

    console.log('[composeThumbnail] Text layout:', {
      title,
      lines: textLayout.lines,
      fontSize: textLayout.fontSize,
      width: textLayout.width,
      height: textLayout.height,
    });

    const lineHeight = textLayout.fontSize * TEXT.LINE_HEIGHT;
    const textBlockHeight = textLayout.lines.length * lineHeight;
    const textStartY = (CANVAS_HEIGHT - textBlockHeight) / 2 + textLayout.fontSize;
    const textStartX = textAreaStartX;

    // Draw 60% opacity black background from left edge to right edge with top/bottom padding
    const bgPaddingTop = 60;
    const bgPaddingBottom = 60;
    const bgX = 0; // Start from left edge
    const bgY = textStartY - textLayout.fontSize - bgPaddingTop;
    const bgWidth = CANVAS_WIDTH; // Extend to right edge
    const bgHeight = textBlockHeight + bgPaddingTop + bgPaddingBottom;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

    // Draw 10px accent line covering only the text with 10px padding above and below
    const accentLineWidth = 10;
    const accentLineSpacing = 30; // More space between accent line and text
    const accentLineX = textAreaStartX - accentLineSpacing - accentLineWidth;
    const accentLineY = textStartY - textLayout.fontSize - 10; // 10px above text
    const accentLineHeight = textBlockHeight + 20; // 10px below text
    const accentLineColor = getRandomAccentColor();

    console.log('[composeThumbnail] Accent line color:', accentLineColor);

    ctx.fillStyle = accentLineColor;
    ctx.fillRect(accentLineX, accentLineY, accentLineWidth, accentLineHeight);

    // Draw text with shadow
    ctx.font = `${textLayout.fontSize}px 'Bebas Neue'`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Add drop shadow to text
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    textLayout.lines.forEach((line, index) => {
      const y = textStartY + (index * lineHeight);
      ctx.fillText(line, textStartX, y);
    });

    // Reset shadow for logo
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Draw logo if provided
    if (logoPath && fs.existsSync(logoPath)) {
      const logoImage = await loadImage(logoPath);
      const logoSize = 100; // Fixed size 100x100px
      const logoX = (CANVAS_WIDTH - logoSize) / 2;
      const logoY = LOGO.TOP_MARGIN;

      ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);
    }

    // Convert canvas to buffer and save with sharp
    const canvasBuffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });

    // Use sharp to ensure proper JPEG format
    await sharp(canvasBuffer)
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    return {
      success: true,
      outputPath,
    };

  } catch (error) {
    console.error('[composeThumbnail] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error composing thumbnail',
    };
  }
}
