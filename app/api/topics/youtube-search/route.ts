// GET /api/topics/youtube-search?q=horror+short+stories&duration=short&limit=10
// Searches YouTube via yt-dlp, returns video metadata + transcript
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

interface YouTubeVideo {
  videoId: string
  title: string
  duration: number // seconds
  views: number
  url: string
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''
  const duration = searchParams.get('duration') || 'short' // short | long | all
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 100)
  const order = searchParams.get('order') || 'viewCount'

  if (!query.trim()) {
    return NextResponse.json({ error: 'q parameter required' }, { status: 400 })
  }

  try {
    // yt-dlp flat playlist with custom separator (pipe chars in titles break simple split)
    const SEP = '<<<YTDLPSEP>>>'
    const ytDlpArgs = [
      '--flat-playlist',
      '--print', `%(title)s${SEP}%(view_count)s${SEP}%(duration)s${SEP}%(id)s`,
      '--playlist-end', String(limit * 3),
      '--no-download',
    ]

    // No duration filter — YouTube search API doesn't support it so --match-filter kills results.
    // For "long story" mode we fetch all and the user decides. For shorts mode, same.
    // User can pick any video regardless of length and cut it into multiple shorts.
    ytDlpArgs.push(`ytsearch${limit * 2}:${query}`)

    const ytDlp = spawn('yt-dlp', ytDlpArgs)
    let stdout = ''
    let stderr = ''

    ytDlp.stdout.on('data', (d) => { stdout += d.toString() })
    ytDlp.stderr.on('data', (d) => { stderr += d.toString() })

    const exitCode = await new Promise<number>((resolve) => {
      ytDlp.on('close', (code) => resolve(code ?? 0))
    })

    if (exitCode !== 0) {
      console.error('yt-dlp search error:', stderr)
    }

    const videos: YouTubeVideo[] = []
    for (const line of stdout.trim().split('\n')) {
      if (!line.includes(SEP)) continue
      const parts = line.split(SEP)
      if (parts.length < 4) continue
      const [title, viewsStr, durationStr, videoId] = parts
      if (!videoId || !title) continue
      const views = parseInt(viewsStr) || 0
      const durationSecs = parseInt(durationStr) || 0
      if (durationSecs === 0) continue // skip lives/streams
      videos.push({
        videoId,
        title: title.trim(),
        duration: durationSecs,
        views,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      })
    }

    // Sort by views descending, then dedupe by videoId
    videos.sort((a, b) => b.views - a.views)
    const seen = new Set<string>()
    const deduped = videos.filter(v => {
      if (seen.has(v.videoId)) return false
      seen.add(v.videoId)
      return true
    })
    const sorted = deduped.slice(0, limit).map(v => ({
      ...v,
      viewsFormatted: formatViews(v.views),
      durationFormatted: formatDuration(v.duration),
    }))

    return NextResponse.json({ videos: sorted, query })
  } catch (error: any) {
    console.error('YouTube search error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
