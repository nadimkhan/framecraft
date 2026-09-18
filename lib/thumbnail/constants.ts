export const THUMBNAIL_CONFIG_SHORT = {
  CANVAS_WIDTH: 1080,
  CANVAS_HEIGHT: 1920,
  ASPECT_RATIO: '9:16',
  
  LOGO: {
    WIDTH: 220,
    TOP_MARGIN: 80,
    FILE_PATH: '/images/logos/logo.png',
  },
  
  TEXT: {
    MAX_WIDTH: 350,
    INITIAL_FONT_SIZE: 72,
    MIN_FONT_SIZE: 37,
    LINE_HEIGHT: 1.15,
    LETTER_SPACING: 0.02,
    COLOR: '#FFFFFF',
    DROP_SHADOW: {
      COLOR: 'rgba(0, 0, 0, 0.5)',
      BLUR: 8,
      OFFSET_X: 2,
      OFFSET_Y: 2,
    },
  },
  
  ACCENT_LINE: {
    WIDTH: 6,
    COLOR: '#2563EB',
    SPACING_FROM_TEXT: 20,
  },
  
  GRADIENT: {
    WIDTH_PERCENT: 0.4,
    START_OPACITY: 0.7,
    END_OPACITY: 0,
    COLOR: '#000000',
  },
  
  OUTPUT_FILENAME: '{title}.jpg',
  TEMP_FILENAME: 'thumbnail-base.jpg',
  
  FONT: {
    FAMILY: 'Bebas Neue',
    WEIGHT: 'bold',
  },
} as const;

export const THUMBNAIL_CONFIG_LONG = {
  CANVAS_WIDTH: 1920,
  CANVAS_HEIGHT: 1080,
  ASPECT_RATIO: '16:9',
  
  LOGO: {
    WIDTH: 180,
    TOP_MARGIN: 40,
    FILE_PATH: '/images/logos/logo.png',
  },
  
  TEXT: {
    MAX_WIDTH: 600,
    INITIAL_FONT_SIZE: 64,
    MIN_FONT_SIZE: 32,
    LINE_HEIGHT: 1.15,
    LETTER_SPACING: 0.02,
    COLOR: '#FFFFFF',
    DROP_SHADOW: {
      COLOR: 'rgba(0, 0, 0, 0.8)',
      BLUR: 10,
      OFFSET_X: 3,
      OFFSET_Y: 3,
    },
  },
  
  ACCENT_LINE: {
    WIDTH: 8,
    COLOR: '#2563EB',
    SPACING_FROM_TEXT: 25,
  },
  
  GRADIENT: {
    WIDTH_PERCENT: 0.3,
    START_OPACITY: 0.8,
    END_OPACITY: 0,
    COLOR: '#000000',
  },
  
  OUTPUT_FILENAME: '{title}.jpg',
  TEMP_FILENAME: 'thumbnail-base.jpg',
  
  FONT: {
    FAMILY: 'Bebas Neue',
    WEIGHT: 'bold',
  },
} as const;

export const THUMBNAIL_CONFIG = THUMBNAIL_CONFIG_SHORT;

export type ThumbnailConfig = typeof THUMBNAIL_CONFIG_SHORT | typeof THUMBNAIL_CONFIG_LONG;
