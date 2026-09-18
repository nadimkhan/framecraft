import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import path from 'path'
import fs from 'fs'
import {
  getCredentialsForVideo,
  hasYouTubeCredentials,
  hasInstagramCredentials,
  type SeriesSocialCredentials,
} from '@/lib/social/credentials'
import { publishYouTubeVideo, YouTubePublishError } from '@/lib/social/youtube'
import { publishInstagramReel, InstagramPublishError } from '@/lib/social/instagram'

/**
 * POST /api/social/publish
 *
 * Publish a finished rendered video to one or more social platforms.
 *
 * Body:
 *   {
 *     videoId: number,            // Video.id from our DB (required)
 *     platforms: ['youtube', 'instagram'],
 *     instagramCaption?: string,
 *     youtubeTitle?: string,
 *     youtubeDescription?: string,
 *     youtubeTags?: string[],
 *     youtubePrivacy?: 'public' | 'private' | 'unlisted',
 *   }
 *
 * Credentials are read from the Series row (video.topic.series). Each Series
 * has its own YouTube channel + Instagram account. Tokens come from the DB
 * (configured via /dashboard/series-settings), NOT from .env.
 *
 * Response:
 *   {
 *     ok: true,
 *     seriesName,
 *     results: { youtube?: {videoId, url}, instagram?: {mediaId, url} },
 *     errors: { platform: { stage, message } }
 *   }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      videoId,
      platforms = ['youtube', 'instagram'],
      instagramCaption,
      youtubeTitle,
      youtubeDescription,
      youtubeTags,
      youtubePrivacy,
    } = body

    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 })
    }

    // Resolve the video + check it has a Series with social credentials.
    // Include metadataJson so we can read the saved Instagram caption and
    // YouTube privacy status (the Uploads page persists those there).
    const video = await prisma.video.findUnique({
      where: { id: Number(videoId) },
      select: {
        id: true,
        videoPath: true,
        title: true,
        description: true,
        tags: true,
        topicId: true,
        metadataJson: true,
      },
    })
    if (!video) {
      return NextResponse.json({ error: `Video ${videoId} not found` }, { status: 404 })
    }
    const meta = (video.metadataJson as any) || {}

    // Resolve final metadata values: explicit body fields win (so the Uploads
    // page can pass edited values without round-tripping to /api/uploads/metadata
    // first), otherwise fall back to whatever is persisted on the row.
    const finalTitle = body.youtubeTitle?.trim() || video.title || 'Untitled'
    const finalDescription = body.youtubeDescription ?? video.description ?? ''
    const finalTags = body.youtubeTags ?? (video.tags ? video.tags.split(',').filter(Boolean) : [])
    const finalPrivacy = body.youtubePrivacy ?? meta.youtubePrivacy ?? 'public'
    const finalCaption = body.instagramCaption ?? meta.instagramCaption ?? ''

    // Look up social credentials via video → topic → series
    const creds = await getCredentialsForVideo(Number(videoId))
    if (!creds) {
      return NextResponse.json(
        { error: `Video ${videoId} has no associated Series. Configure Series settings first.` },
        { status: 400 },
      )
    }

    // Verify the rendered video exists on disk
    let videoAbsPath: string
    try {
      videoAbsPath = resolveVideoPath(video.videoPath || '')
    } catch (e: any) {
      return NextResponse.json(
        { error: `Rendered video not found at ${video.videoPath}: ${e.message}` },
        { status: 400 },
      )
    }

    const results: any = {}
    const errors: any = {}

    // ─── YouTube ──────────────────────────────────────────────────────
    if (platforms.includes('youtube')) {
      if (!hasYouTubeCredentials(creds)) {
        errors.youtube = {
          stage: 'auth',
          message: 'YouTube channel ID or access token missing on this Series. Set them in Series settings.',
        }
      } else {
        try {
          const ytResult = await publishYouTubeVideo({
            videoPath: videoAbsPath,
            title: finalTitle,
            description: finalDescription,
            tags: finalTags,
            privacyStatus: finalPrivacy as 'public' | 'private' | 'unlisted',
            madeForKids: false,
          }, {
            accessToken: creds.youtubeAccessToken!,
            channelId: creds.youtubeChannelId!,
            refreshToken: creds.youtubeRefreshToken,
          })
          results.youtube = ytResult
          await prisma.video.update({
            where: { id: video.id },
            data: {
              youtubeVideoId: ytResult.videoId,
              uploadStatus: 'uploaded',
            },
          })
        } catch (e: any) {
          errors.youtube = e instanceof YouTubePublishError
            ? { stage: e.stage, message: e.message }
            : { stage: 'unknown', message: e?.message || String(e) }
        }
      }
    }

    // ─── Instagram ───────────────────────────────────────────────────
    if (platforms.includes('instagram')) {
      if (!hasInstagramCredentials(creds)) {
        errors.instagram = {
          stage: 'auth',
          message: 'Instagram account ID or access token missing on this Series. Set them in Series settings.',
        }
      } else {
        try {
          // IG requires a publicly reachable URL. For localhost-only testing,
          // set NEXT_PUBLIC_VIDEO_CDN to a public host (ngrok, S3+CDN, etc.).
          const publicUrl = process.env.NEXT_PUBLIC_VIDEO_CDN
            ? `${process.env.NEXT_PUBLIC_VIDEO_CDN.replace(/\/$/, '')}/${video.videoPath?.replace(/^\//, '')}`
            : null
          if (!publicUrl) {
            errors.instagram = {
              stage: 'config',
              message:
                'Instagram publishing requires NEXT_PUBLIC_VIDEO_CDN env var pointing to a public URL where the rendered video.mp4 is reachable. For local-only testing, set up an ngrok tunnel or S3+CDN.',
            }
          } else {
            const igResult = await publishInstagramReel(
              {
                videoUrl: publicUrl,
                caption:
                  finalCaption ||
                  `${video.title || ''}\n\n#shorts #storytime #horror`,
                coverUrl: undefined,
              },
              {
                igUserId: creds.instagramAccountId!,
                accessToken: creds.instagramAccessToken!,
              },
            )
            results.instagram = {
              creationId: igResult.creationId,
              mediaId: igResult.mediaId,
              url: igResult.permalink,
            }
            await prisma.video.update({
              where: { id: video.id },
              data: {
                metadataJson: {
                  ...((video as any).metadataJson || {}),
                  instagramMediaId: igResult.mediaId,
                  instagramPermalink: igResult.permalink,
                  instagramPostedAt: new Date().toISOString(),
                },
                uploadStatus: results.youtube ? 'uploaded' : undefined,
              },
            })
          }
        } catch (e: any) {
          errors.instagram = e instanceof InstagramPublishError
            ? { stage: (e as any).step, message: e.message }
            : { stage: 'unknown', message: e?.message || String(e) }
        }
      }
    }

    return NextResponse.json({
      ok: Object.keys(errors).length === 0,
      seriesName: creds.seriesName,
      seriesId: creds.seriesId,
      results,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('[publish] error:', error)
    return NextResponse.json(
      { error: 'Failed to publish', details: error?.message || String(error) },
      { status: 500 },
    )
  }
}

function resolveVideoPath(videoUrl: string): string {
  const abs = path.join(process.cwd(), 'public', videoUrl.replace(/^\//, ''))
  if (!fs.existsSync(abs)) {
    throw new Error(`Video file not found at ${abs}`)
  }
  return abs
}
