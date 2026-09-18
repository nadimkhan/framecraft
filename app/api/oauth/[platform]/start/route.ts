import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  youtubeOAuth,
  instagramOAuth,
  callbackUrl,
  generateOAuthState,
  type Platform,
} from '@/lib/social/config'
import { prisma } from '@/lib/db'

/**
 * GET /api/oauth/[platform]/start?seriesId=...
 *
 * Kicks off the OAuth dance for YouTube or Instagram.
 * After consent, platform redirects to /api/oauth/[platform]/callback
 * with `code` + `state`. Callback exchanges code → tokens and persists
 * them to the Series row (youtubeAccessToken / instagramAccessToken).
 *
 * Query params:
 *   seriesId  – which Series to associate the account with (required)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const platform = (await params).platform as Platform
  if (platform !== 'youtube' && platform !== 'instagram') {
    return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 })
  }

  const seriesId = request.nextUrl.searchParams.get('seriesId')
  if (!seriesId) {
    return NextResponse.json({ error: 'seriesId query param is required' }, { status: 400 })
  }

  // Verify the series exists
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    select: { id: true, seriesName: true },
  })
  if (!series) {
    return NextResponse.json({ error: 'Series not found' }, { status: 404 })
  }

  const oauth = platform === 'youtube' ? youtubeOAuth : instagramOAuth

  if (!oauth.configured()) {
    return NextResponse.json(
      {
        error: `${platform} OAuth is not configured`,
        hint:
          platform === 'youtube'
            ? 'Set YOUTUBE_OAUTH_CLIENT_ID and YOUTUBE_OAUTH_CLIENT_SECRET in .env'
            : 'Set INSTAGRAM_OAUTH_APP_ID and INSTAGRAM_OAUTH_APP_SECRET in .env',
      },
      { status: 503 },
    )
  }

  // CSRF state — verified on callback
  const state = generateOAuthState()

  const cookieJar = await cookies()
  cookieJar.set('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })
  cookieJar.set('oauth_platform', platform, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })
  // Store seriesId so the callback knows which row to update
  cookieJar.set('oauth_series_id', seriesId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })

  const redirectUri = callbackUrl(platform)
  let authorizeUrl: string

  if (platform === 'youtube') {
    const yt = oauth as typeof youtubeOAuth
    const params = new URLSearchParams({
      client_id: yt.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: yt.scopes,
      access_type: 'offline',
      prompt: 'consent',
      state,
    })
    authorizeUrl = `${yt.authorizeUrl}?${params}`
  } else {
    const ig = oauth as typeof instagramOAuth
    const params = new URLSearchParams({
      client_id: ig.appId,
      redirect_uri: redirectUri,
      scope: ig.scopes,
      response_type: 'code',
      state,
    })
    authorizeUrl = `${ig.authorizeUrl}?${params}`
  }

  return NextResponse.redirect(authorizeUrl)
}
