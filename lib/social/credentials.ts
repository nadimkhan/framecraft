import { prisma } from '../db'
import { decryptToken } from '../crypto'

/**
 * Per-Series social credentials.
 *
 * Each Series in our DB IS one YouTube channel + one Instagram account.
 * The publish pipeline reads these fields directly off the Series row
 * (loaded via videoId → topicId → seriesId), no .env lookup needed.
 *
 * Tokens stored as plain text on the Series row for now. For production
 * hardening, encrypt with lib/crypto.ts using SOCIAL_TOKEN_ENC_KEY — TODO.
 */

export interface SeriesSocialCredentials {
  seriesId: string
  seriesName: string

  // YouTube
  youtubeChannelId: string | null
  youtubeChannelName: string | null
  youtubeAccessToken: string | null
  youtubeRefreshToken: string | null
  youtubeTokenExpiresAt: Date | null

  // Instagram
  instagramAccountId: string | null
  instagramAccountName: string | null
  instagramAccessToken: string | null
  instagramTokenExpiresAt: Date | null
}

/**
 * Resolve the credentials for a given Video by walking the FK chain:
 *   Video.topicId → Topic.seriesId → Series
 *
 * Returns null if any link in the chain is missing.
 */
export async function getCredentialsForVideo(videoId: number): Promise<SeriesSocialCredentials | null> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      topic: {
        select: {
          id: true,
          seriesId: true,
          series: {
            select: {
              id: true,
              seriesName: true,
              youtubeChannelId: true,
              youtubeChannelName: true,
              youtubeAccessToken: true,
              youtubeRefreshToken: true,
              youtubeTokenExpiresAt: true,
              instagramAccountId: true,
              instagramAccountName: true,
              instagramAccessToken: true,
              instagramTokenExpiresAt: true,
            },
          },
        },
      },
    },
  })
  if (!video || !(video as any).topic?.series) return null
  const { topic } = video as any
  return {
    seriesId: topic.series.id,
    seriesName: topic.series.seriesName,
    youtubeChannelId: topic.series.youtubeChannelId,
    youtubeChannelName: topic.series.youtubeChannelName,
    youtubeAccessToken: topic.series.youtubeAccessToken,
    youtubeRefreshToken: topic.series.youtubeRefreshToken,
    youtubeTokenExpiresAt: topic.series.youtubeTokenExpiresAt,
    instagramAccountId: topic.series.instagramAccountId,
    instagramAccountName: topic.series.instagramAccountName,
    instagramAccessToken: topic.series.instagramAccessToken,
    instagramTokenExpiresAt: topic.series.instagramTokenExpiresAt,
  }
}

/**
 * Fetch credentials by Series id (when no Video is involved yet).
 */
export async function getCredentialsForSeries(seriesId: string): Promise<SeriesSocialCredentials | null> {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    select: {
      id: true,
      seriesName: true,
      youtubeChannelId: true,
      youtubeChannelName: true,
      youtubeAccessToken: true,
      youtubeRefreshToken: true,
      youtubeTokenExpiresAt: true,
      instagramAccountId: true,
      instagramAccountName: true,
      instagramAccessToken: true,
      instagramTokenExpiresAt: true,
    },
  })
  if (!series) return null
  const s = series as any
  return {
    seriesId: s.id,
    seriesName: s.seriesName,
    youtubeChannelId: s.youtubeChannelId,
    youtubeChannelName: s.youtubeChannelName,
    youtubeAccessToken: s.youtubeAccessToken,
    youtubeRefreshToken: s.youtubeRefreshToken,
    youtubeTokenExpiresAt: s.youtubeTokenExpiresAt,
    instagramAccountId: s.instagramAccountId,
    instagramAccountName: s.instagramAccountName,
    instagramAccessToken: s.instagramAccessToken,
    instagramTokenExpiresAt: s.instagramTokenExpiresAt,
  }
}

/**
 * True if the YouTube credentials look usable (have a channel id + access token).
 * Used by the publish endpoint to decide whether to attempt YouTube.
 */
export function hasYouTubeCredentials(c: SeriesSocialCredentials | null): boolean {
  return Boolean(c?.youtubeChannelId && c?.youtubeAccessToken)
}

/**
 * True if the Instagram credentials look usable (have a numeric account id + token).
 */
export function hasInstagramCredentials(c: SeriesSocialCredentials | null): boolean {
  return Boolean(c?.instagramAccountId && c?.instagramAccessToken)
}
