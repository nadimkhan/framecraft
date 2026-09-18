/**
 * Centralised config for the social-media OAuth flows.
 *
 * Add credentials via .env:
 *
 *   # YouTube (Google Cloud Console → APIs & Services → Credentials → OAuth 2.0)
 *   YOUTUBE_OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com
 *   YOUTUBE_OAUTH_CLIENT_SECRET=GOCSPX-xxx
 *
 *   # Instagram (Meta for Developers → App → Facebook Login for Business)
 *   INSTAGRAM_OAUTH_APP_ID=123456789012345
 *   INSTAGRAM_OAUTH_APP_SECRET=abc123def456
 *
 * The callback URLs must match EXACTLY what you registered in the platform's
 * developer console. Default is the local dev URL.
 */

export type Platform = 'youtube' | 'instagram'

export const OAUTH_REDIRECT_BASE =
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export function callbackUrl(platform: Platform): string {
  return `${OAUTH_REDIRECT_BASE}/api/oauth/${platform}/callback`
}

// ─── YouTube (Google OAuth 2.0) ───────────────────────────────────────────
// Scopes: upload = resumable upload + manage video metadata
//         force-ssl = ensures HTTPS-only API endpoints
const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ')

export const youtubeOAuth = {
  clientId: process.env.YOUTUBE_OAUTH_CLIENT_ID || '',
  clientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET || '',
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  channelInfoUrl: 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
  userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
  scopes: YOUTUBE_SCOPES,
  configured: () =>
    Boolean(process.env.YOUTUBE_OAUTH_CLIENT_ID && process.env.YOUTUBE_OAUTH_CLIENT_SECRET),
}

// ─── Instagram (Meta Graph API via Facebook Login) ────────────────────────
// Facebook Login is the modern path: user signs in with Facebook, we get a
// token that can post to linked IG Business accounts via the Graph API.
const INSTAGRAM_SCOPES = [
  'public_profile',     // basic profile info
  'email',
  'pages_show_list',     // list pages the user manages
  'pages_manage_posts',  // post on behalf of pages (which can include IG Business accounts)
  'instagram_basic',     // access IG account info
  'instagram_content_publish', // publish IG media
].join(',')

export const instagramOAuth = {
  appId: process.env.INSTAGRAM_OAUTH_APP_ID || '',
  appSecret: process.env.INSTAGRAM_OAUTH_APP_SECRET || '',
  authorizeUrl: 'https://www.facebook.com/v20.0/dialog/oauth',
  tokenUrl: 'https://graph.facebook.com/v20.0/oauth/access_token',
  longLivedTokenUrl: 'https://graph.facebook.com/v20.0/oauth/access_token',
  accountsUrl: 'https://graph.facebook.com/v20.0/me/accounts',
  igBusinessLookupUrl: 'https://graph.facebook.com/v20.0/{page-id}?fields=instagram_business_account',
  scopes: INSTAGRAM_SCOPES,
  configured: () =>
    Boolean(process.env.INSTAGRAM_OAUTH_APP_ID && process.env.INSTAGRAM_OAUTH_APP_SECRET),
}

/**
 * Generate a random state string for OAuth CSRF protection.
 * Stored in an HttpOnly cookie on /api/oauth/start and verified on /callback.
 */
export function generateOAuthState(): string {
  return require('crypto').randomBytes(24).toString('hex')
}
