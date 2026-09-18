import fs from 'fs';
import path from 'path';

const MUSIC_FOLDER = 'public/audio/music';

/**
 * Pick a random background music file.
 *
 * If a niche category is provided, prefer tracks whose filename starts with the
 * category slug (case-insensitive) or any of the standard synonyms. Falls back
 * to a fully random pick from all tracks if no category-specific match is found.
 *
 *   Horror      → horror-*.mp3, dark-*.mp3, eerie-*.mp3, tension-*.mp3, mystery-*.mp3
 *   Comedy      → comedy-*.mp3, funny-*.mp3
 *   Motivation  → motivational-*.mp3, epic-*.mp3
 *   Gaming      → action-*.mp3, epic-*.mp3
 *   Finance     → calm-*.mp3, soulfuljamtracks-*.mp3
 */
export function getRandomMusicFile(nicheCategory?: string | null): string | null {
  const fullPath = path.join(process.cwd(), MUSIC_FOLDER);

  if (!fs.existsSync(fullPath)) {
    console.warn(`Music folder not found: ${fullPath}`);
    return null;
  }

  const files = fs.readdirSync(fullPath);
  const audioFiles = files.filter(file =>
    /\.(mp3|wav|ogg|m4a|webm)$/i.test(file)
  );

  if (audioFiles.length === 0) {
    console.warn(`No audio files found in ${fullPath}`);
    return null;
  }

  // Build a category-keyword map for niche-aware matching
  const categoryKeywords: Record<string, string[]> = {
    horror: ['horror', 'dark', 'eerie', 'tension', 'mysterious', 'mystery'],
    comedy: ['comedy', 'funny'],
    motivation: ['motivational', 'epic', 'inspirational', 'soulfuljamtracks'],
    gaming: ['action', 'epic', 'sigmamusicart', 'miromaxmusic'],
    finance: ['calm', 'soulfuljamtracks', 'inspirational'],
  };

  let candidates = audioFiles;
  if (nicheCategory) {
    const normalized = nicheCategory.toLowerCase().trim()
    const keywords = categoryKeywords[normalized] || [normalized]
    const filtered = audioFiles.filter(f =>
      keywords.some(kw => f.toLowerCase().includes(kw))
    )
    if (filtered.length > 0) {
      candidates = filtered
    } else {
      console.warn(`[music] No tracks for niche "${nicheCategory}", falling back to all ${audioFiles.length} tracks`)
    }
  }

  const randomIndex = Math.floor(Math.random() * candidates.length);
  const selectedFile = candidates[randomIndex];

  console.log(`  Selected background music: ${selectedFile} (${candidates.length} candidates for niche="${nicheCategory || 'any'}")`);

  return `/audio/music/${selectedFile}`;
}

export function getMusicFileList(nicheCategory?: string | null): string[] {
  const fullPath = path.join(process.cwd(), MUSIC_FOLDER);

  if (!fs.existsSync(fullPath)) {
    return [];
  }

  const files = fs.readdirSync(fullPath);
  return files
    .filter(file => /\.(mp3|wav|ogg|m4a|webm)$/i.test(file))
    .map(file => `/audio/music/${file}`);
}
