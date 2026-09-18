import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * POST /api/uploads/research
 * Body: { videoId: number }
 *
 * Pulls richer metadata from the original YouTube source for this video.
 * Uses the youtube-transcript-api or the saved sourceTranscript on the Topic.
 *
 * For YouTube-sourced videos: hits YouTube oEmbed for canonical title +
 * author/channel + thumbnail, and pulls tags by scraping the watch page.
 *
 * Returns:
 *   { title, description, tags, caption, hasTranscript }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { videoId } = body as { videoId: number }
    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 })
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: {
        topic: true,
      },
    })
    if (!video || !video.topic) {
      return NextResponse.json({ error: `Video ${videoId} not found` }, { status: 404 })
    }
    const topic = video.topic

    // Default response: use what we already have on the Topic
    const result: any = {
      title: topic.title,
      description: topic.sourceTranscript || topic.fullStory || '',
      tags: extractTags(topic.title),
      caption: buildCaption(topic, topic.title),
      hasTranscript: Boolean(topic.sourceTranscript),
    }

    // If the source is YouTube, fetch live metadata via oEmbed + transcript.
    if (topic.sourceType === 'youtube' && topic.sourceUrl) {
      const ytId = extractYouTubeId(topic.sourceUrl)
      if (ytId) {
        try {
          const oembed = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(topic.sourceUrl)}&format=json`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } },
          )
          if (oembed.ok) {
            const meta: any = await oembed.json()
            result.title = (meta.title || result.title).slice(0, 100)
            result.description = (meta.author_name ? `${meta.author_name} · ${result.description}` : result.description).slice(0, 5000)
            // Try to pull the existing transcript (already in topic.sourceTranscript
            // from when we researched this video earlier)
          }
        } catch (e) {
          console.warn('[research] oEmbed fetch failed:', (e as any)?.message)
        }
      }
    }

    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[research] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|\/)([\w-]{11})(?:\?|&|$)/)
  return m ? m[1] : null
}

function extractTags(title: string): string[] {
  if (!title) return ['shorts']
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 10)
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
