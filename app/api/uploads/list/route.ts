import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import fs from 'fs'
import path from 'path'

/**
 * GET /api/uploads/list?seriesId=...
 *
 * Returns all rendered videos belonging to the given Series.
 *
 * Three-pass approach (each pass opportunistic, faster paths first):
 *   1. Trust the Video.videoPath column (set by the render pipeline on success)
 *   2. Build folder paths from each topic's Scene.imagePath — the scene files
 *      are written to disk under /generations/<Folder>/scene_N/, so a folder
 *      derived from scene 0's path is authoritative even if Video.videoPath
 *      wasn't updated.
 *   3. Last resort: fuzzy ASCII match against the topic title.
 *
 * We also opportunistically fix the DB (write videoPath on success) so future
 * loads are fast.
 */
export async function GET(request: NextRequest) {
  const seriesId = request.nextUrl.searchParams.get('seriesId')
  if (!seriesId) {
    return NextResponse.json({ error: 'seriesId is required' }, { status: 400 })
  }

  const topics = await prisma.topic.findMany({
    where: { seriesId },
    orderBy: { id: 'desc' },
    include: {
      video: {
        include: {
          scenes: {
            orderBy: { index: 'asc' },
            select: { narration: true, index: true, imagePath: true },
          },
        },
      },
    },
  })

  const videos: any[] = []

  for (const t of topics) {
    const videoId = t.video?.id
    let videoPath: string | null = t.video?.videoPath ?? null

    // ── Pass 1: DB column ──────────────────────────────────────────
    // (already loaded above)

    // ── Pass 2: derive folder from Scene.imagePath ─────────────────
    // Scenes[0].imagePath looks like /generations/<Folder>/scene_0/<file>.png
    // Take the directory part, swap scene_0 → video.mp4
    if (!videoPath && t.video?.scenes?.[0]?.imagePath) {
      const scenePath = t.video.scenes[0].imagePath
      const inferred = inferVideoPathFromScenePath(scenePath)
      if (inferred && fs.existsSync(inferred.absolutePath)) {
        videoPath = inferred.relativePath
      }
    }

    // ── Pass 3: title-based fuzzy match ────────────────────────────
    if (!videoPath) {
      const inferred = inferVideoPathFromDisk(t.title, t.id)
      if (inferred && fs.existsSync(inferred.absolutePath)) {
        videoPath = inferred.relativePath
      }
    }

    // Opportunistic DB fix — make future loads fast via pass 1
    if (videoPath && videoId && t.video?.videoPath !== videoPath) {
      try {
        await prisma.video.update({
          where: { id: videoId },
          data: { videoPath, generationStatus: 'ready' },
        })
      } catch {
        // ignore — best-effort
      }
    }

    if (!videoPath) continue

    const video = t.video
    const meta = (video?.metadataJson as any) || {}
    // Prefer user-saved metadata on the Video row (set via /api/uploads/metadata).
    // Fall back to topic-derived defaults for newly-rendered videos that
    // haven't been edited yet.
    const title = (video?.title?.trim()) || buildTitle(t)
    const description = video?.description ?? buildDescription(t)
    const tags = video?.tags
      ? video.tags.split(',').map(t => t.trim()).filter(Boolean)
      : buildTags(t)
    const caption = meta.instagramCaption ?? buildCaption(t, title)
    const privacyStatus = meta.youtubePrivacy ?? 'public'
    const transcript = video?.scenes
      ?.map((s) => s.narration)
      .filter(Boolean)
      .join('\n\n') || ''

    videos.push({
      videoId: videoId ?? 0,
      topicId: t.id,
      topicTitle: t.title,
      sourceType: t.sourceType,
      sourceUrl: t.sourceUrl,
      sourceViews: t.sourceViews,
      sourceDuration: t.sourceDuration,
      hasTranscript: Boolean(transcript) || Boolean(t.sourceTranscript),
      transcript: t.sourceTranscript || transcript,
      videoPath,
      title,
      description,
      tags,
      caption,
      privacyStatus,
      youtubeVideoId: video?.youtubeVideoId,
      youtubeUrl: video?.youtubeVideoId ? `https://youtu.be/${video.youtubeVideoId}` : null,
      instagramMediaId: meta.instagramMediaId ?? null,
      instagramUrl:
        meta.instagramPermalink ??
        (meta.instagramMediaId
          ? `https://www.instagram.com/p/${meta.instagramMediaId}/`
          : null),
    })
  }

  return NextResponse.json({ videos })
}

/**
 * Derive the video.mp4 path from a scene file path. Scene paths look like:
 *   /generations/<Folder>/scene_0/<file>.png
 * The video.mp4 sits one level up at:
 *   /generations/<Folder>/video.mp4
 *
 * This is the MOST RELIABLE match because the scene files were actually
 * written by the asset generation pipeline — the folder name in the path
 * is the real on-disk name regardless of any later title renames.
 */
function inferVideoPathFromScenePath(
  sceneImagePath: string,
): { absolutePath: string; relativePath: string } | null {
  // sceneImagePath: /generations/<Folder>/scene_0/<file>.png
  // Strip "/scene_<N>/<file>" from the end, leaving just the topic folder.
  const m = sceneImagePath.match(/^(.+\/)scene_\d+\/.+$/)
  if (!m) return null
  const topicFolder = m[1].replace(/\/$/, '')  // drop trailing slash
  const relativePath = `${topicFolder}/video.mp4`
  const absolutePath = path.join(process.cwd(), 'public', topicFolder.replace(/^\//, ''), 'video.mp4')
  return { absolutePath, relativePath }
}

/**
 * Scan the public/generations tree for a video.mp4 file matching this topic.
 *
 * The render pipeline creates topic folders by stripping non-ASCII characters
 * and replacing certain separators with underscores. We try several
 * variants and also a fuzzy-match fallback.
 */
function inferVideoPathFromDisk(
  topicTitle: string,
  topicId: number,
): { absolutePath: string; relativePath: string } | null {
  const generationsDir = path.join(process.cwd(), 'public', 'generations')
  if (!fs.existsSync(generationsDir)) return null

  // Generate candidate folder names from the topic title.
  // Approach: strip non-ASCII (Hindi, emoji), collapse separators.
  const ascii = topicTitle.replace(/[^\x20-\x7E]/g, '')
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const targetNorm = norm(ascii)
  const targetPrefix = targetNorm.slice(0, 16)

  // Try a bunch of sanitized variants first (fast path)
  const variants = new Set<string>()
  for (const sep of ['_', '-']) {
    const v = ascii
      .replace(/[|/\\:&]+/g, sep)
      .replace(/\s+/g, sep)
      .replace(/[^a-zA-Z0-9_\-]/g, '')
    variants.add(v)
    variants.add(v.slice(0, 60))
  }
  // Try the raw first-50-chars (legacy behavior from older renders)
  variants.add(ascii.slice(0, 50))

  for (const v of variants) {
    if (!v) continue
    const videoPath = path.join(generationsDir, v, 'video.mp4')
    if (fs.existsSync(videoPath)) {
      return {
        absolutePath: videoPath,
        relativePath: `/generations/${v}/video.mp4`,
      }
    }
  }

  // Last resort: fuzzy match by reading every folder and comparing ASCII-folded
  // prefix overlap (>= 16 chars of normalized title must match start of folder).
  if (!targetPrefix) return null
  const folders = fs.readdirSync(generationsDir).filter(d =>
    fs.statSync(path.join(generationsDir, d)).isDirectory(),
  )
  for (const folder of folders) {
    if (norm(folder).startsWith(targetPrefix)) {
      const videoPath = path.join(generationsDir, folder, 'video.mp4')
      if (fs.existsSync(videoPath)) {
        return {
          absolutePath: videoPath,
          relativePath: `/generations/${folder}/video.mp4`,
        }
      }
    }
  }

  return null
}

// ─── Metadata builders ──────────────────────────────────────────────────

function buildTitle(topic: any): string {
  return (topic.title || 'Untitled').slice(0, 100)
}

function buildDescription(topic: any): string {
  const parts: string[] = []
  if (topic.sourceType === 'youtube' && topic.sourceUrl) {
    parts.push(`Original source: ${topic.sourceUrl}`)
  }
  if (topic.sourceTranscript) {
    parts.push('')
    parts.push(topic.sourceTranscript.slice(0, 4500))
  } else if (topic.fullStory) {
    parts.push('')
    parts.push(topic.fullStory.slice(0, 4500))
  }
  return parts.join('\n').trim().slice(0, 5000)
}

function buildCaption(topic: any, title: string): string {
  const lines: string[] = []
  lines.push(title.slice(0, 100))
  if (topic.sourceUrl) {
    lines.push('')
    lines.push(`Source: ${topic.sourceUrl}`)
  }
  lines.push('')
  lines.push('#shorts #storytime #horror #viral #trending')
  return lines.join('\n').trim().slice(0, 2200)
}

function buildTags(topic: any): string[] {
  const tags = new Set<string>()
  const titleTokens = (topic.title || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w: string) => w.length > 3 && !['this', 'that', 'with', 'from'].includes(w))
  titleTokens.slice(0, 5).forEach((t: string) => tags.add(t))
  tags.add('shorts')
  tags.add('story')
  return Array.from(tags).slice(0, 15)
}
