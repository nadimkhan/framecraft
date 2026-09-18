import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  youtubeOAuth,
  instagramOAuth,
  callbackUrl,
  type Platform,
} from '@/lib/social/config'
import { encryptToken } from '@/lib/crypto'
import { prisma } from '@/lib/db'

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

/**
 * GET /api/oauth/[platform]/callback
 *
 * Receives the redirect from the platform after the user authorises the app.
 * 1. Verify CSRF state matches the cookie set by /start
 * 2. Exchange the `code` for access + refresh tokens
 * 3. For YouTube: fetch channel info, save tokens + channelId to the Series row
 * 4. For Instagram: fetch account info, save token + accountId to the Series row
 * 5. Redirect back to series-settings with a success/failure flash
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const platform = (await params).platform as Platform
  if (platform !== 'youtube' && platform !== 'instagram') {
    return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 })
  }

  const search = request.nextUrl.searchParams
  const code = search.get('code')
  const state = search.get('state')
  const errorParam = search.get('error')

  const cookieJar = await cookies()
  const expectedState = cookieJar.get('oauth_state')?.value
  const cookiePlatform = cookieJar.get('oauth_platform')?.value
  const seriesId = cookieJar.get('oauth_series_id')?.value

  // Clear OAuth cookies — they're one-shot
  cookieJar.delete('oauth_state')
  cookieJar.delete('oauth_platform')
  cookieJar.delete('oauth_series_id')

  if (errorParam) {
    return NextResponse.redirect(redirectWithFlash(seriesId, platform, 'error', `Platform returned: ${errorParam}`))
  }
  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state in callback' }, { status: 400 })
  }
  if (state !== expectedState || cookiePlatform !== platform) {
    return NextResponse.redirect(redirectWithFlash(seriesId, platform, 'error', 'CSRF state mismatch — please try again.'))
  }
  if (!seriesId) {
    return NextResponse.json({ error: 'OAuth seriesId cookie missing' }, { status: 400 })
  }

  // Exchange code for tokens
  const oauth = platform === 'youtube' ? youtubeOAuth : instagramOAuth
  if (!oauth.configured()) {
    return NextResponse.json({ error: `${platform} OAuth not configured on the server` }, { status: 503 })
  }
  const redirectUri = callbackUrl(platform)

  let tokens: TokenResponse
  try {
    tokens = await exchangeCode(platform, code, redirectUri, oauth)
  } catch (e: any) {
    return NextResponse.redirect(redirectWithFlash(seriesId, platform, 'error', `Token exchange failed: ${e.message}`))
  }

  // For Instagram: short-lived → long-lived token swap
  if (platform === 'instagram') {
    try {
      tokens = await swapInstagramLongLivedToken(tokens.access_token)
    } catch (e: any) {
      console.warn('[oauth] IG long-lived swap failed (continuing with short-lived):', e.message)
    }
  }

  const expiresAt = tokens.expires_in != null ? new Date(Date.now() + tokens.expires_in * 1000) : null

  // ─── YouTube: fetch channel info and save to Series ────────────────────────
  if (platform === 'youtube') {
    try {
      const profile = await fetchYouTubeChannel(tokens.access_token)
      await prisma.series.update({
        where: { id: seriesId },
        data: {
          youtubeChannelId: profile.channelId,
          youtubeChannelName: profile.channelName,
          youtubeAccessToken: encryptToken(tokens.access_token),
          youtubeRefreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
          youtubeTokenExpiresAt: expiresAt,
        },
      })
      return NextResponse.redirect(
        redirectWithFlash(seriesId, platform, 'success', `YouTube channel "${profile.channelName}" connected!`)
      )
    } catch (e: any) {
      return NextResponse.redirect(redirectWithFlash(seriesId, platform, 'error', `Failed to fetch YouTube channel: ${e.message}`))
    }
  }

  // ─── Instagram: fetch account info and save to Series ─────────────────────
  try {
    const profile = await fetchInstagramAccount(tokens.access_token)
    await prisma.series.update({
      where: { id: seriesId },
      data: {
        instagramAccountId: profile.accountId,
        instagramAccountName: profile.username,
        instagramAccessToken: encryptToken(tokens.access_token),
        instagramTokenExpiresAt: expiresAt,
      },
    })
    return NextResponse.redirect(
      redirectWithFlash(seriesId, platform, 'success', `Instagram @${profile.username} connected!`)
    )
  } catch (e: any) {
    return NextResponse.redirect(redirectWithFlash(seriesId, platform, 'error', `Failed to fetch Instagram account: ${e.message}`))
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function exchangeCode(
  platform: Platform,
  code: string,
  redirectUri: string,
  oauth: typeof youtubeOAuth | typeof instagramOAuth,
): Promise<TokenResponse> {
  const params = new URLSearchParams()
  params.set('code', code)
  params.set('redirect_uri', redirectUri)
  params.set('grant_type', 'authorization_code')

  let url: string
  let headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }

  if (platform === 'youtube') {
    const yt = oauth as typeof youtubeOAuth
    url = yt.tokenUrl
    params.set('client_id', yt.clientId)
    params.set('client_secret', yt.clientSecret)
  } else {
    const ig = oauth as typeof instagramOAuth
    url = ig.tokenUrl
    params.set('client_id', ig.appId)
    params.set('client_secret', ig.appSecret)
  }

  const res = await fetch(url, { method: 'POST', headers, body: params.toString() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${platform} token exchange failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return await res.json()
}

async function swapInstagramLongLivedToken(shortLivedToken: string): Promise<TokenResponse> {
  const ig = instagramOAuth
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: ig.appId,
    client_secret: ig.appSecret,
    fb_exchange_token: shortLivedToken,
  })
  const url = `${ig.longLivedTokenUrl}?${params}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`IG long-lived swap failed: ${res.status}`)
  const data = await res.json()
  return { access_token: data.access_token, expires_in: data.expires_in, token_type: data.token_type }
}

interface YouTubeChannelProfile {
  channelId: string
  channelName: string
}

async function fetchYouTubeChannel(accessToken: string): Promise<YouTubeChannelProfile> {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&access_token=${encodeURIComponent(accessToken)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch YouTube channel (${res.status})`)
  const data = await res.json()
  const channel = data.items?.[0]
  if (!channel) throw new Error('No YouTube channel found for this account')
  return {
    channelId: channel.id,
    channelName: channel.snippet?.title || channel.id,
  }
}

interface InstagramAccountProfile {
  accountId: string
  username: string
}

async function fetchInstagramAccount(accessToken: string): Promise<InstagramAccountProfile> {
  // Get the IG Business account linked to the FB user
  const url = `https://graph.facebook.com/v20.0/me/accounts?access_token=${encodeURIComponent(accessToken)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch FB pages (${res.status})`)
  const data = await res.json()
  const page = data.data?.[0]
  if (!page?.instagram_business_account) {
    // Try fetching IG account directly
    const igUrl = `https://graph.facebook.com/v20.0/me?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(accessToken)}`
    const igRes = await fetch(igUrl)
    if (!igRes.ok) throw new Error(`Failed to fetch IG account (${igRes.status})`)
    const igData = await igRes.json()
    if (!igData.instagram_business_account) throw new Error('No Instagram Business account found')
    return {
      accountId: igData.instagram_business_account.id,
      username: igData.instagram_business_account.username || igData.instagram_business_account.id,
    }
  }
  const igAccount = page.instagram_business_account
  return {
    accountId: igAccount.id,
    username: igAccount.username || igAccount.id,
  }
}

function redirectWithFlash(
  seriesId: string | undefined,
  platform: Platform,
  type: 'success' | 'error',
  message: string,
) {
  const back = seriesId
    ? `/dashboard/series-settings?seriesId=${seriesId}`
    : '/dashboard/series-settings'
  const params = new URLSearchParams({ social_flash: type, social_platform: platform, social_message: message })
  return `${back}#${params.toString()}`
}
