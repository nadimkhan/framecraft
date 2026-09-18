import fs from 'fs'

/**
 * YouTube Data API v3 — direct video upload via resumable upload.
 *
 * Two-step resumable upload (per Google's docs):
 *   1. POST /upload/youtube/v3/videos?uploadType=resumable
 *      - Returns a Location header with the upload URL
 *      - Body is a Video resource snippet (title, description, status)
 *   2. PUT to that upload URL with the actual video bytes
 *
 * Scope required: https://www.googleapis.com/auth/youtube.upload
 *
 * For OAuth-refreshable tokens, lib/social/youtube-token-refresh.ts swaps
 * expired access tokens automatically before each upload.
 */

const YT_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos'
const YT_BASE = 'https://www.googleapis.com/youtube/v3/videos'

export interface YouTubeCredentials {
  accessToken: string
  channelId: string
  refreshToken?: string | null
}

export interface YouTubePublishInput {
  videoPath: string           // absolute local path to the .mp4
  title: string               // ≤100 chars
  description?: string        // ≤5000 chars
  tags?: string[]
  categoryId?: string         // e.g. '22' for People & Blogs
  privacyStatus?: 'public' | 'private' | 'unlisted'
  madeForKids?: boolean       // COPPA compliance
  /** Default 'en_US'. Set to 'hi' for Hindi, 'en' for English, etc. */
  defaultLanguage?: string
  /** Default 'US'. ISO 3166-1 alpha-2. */
  defaultAudioLanguage?: string
}

export interface YouTubePublishResult {
  videoId: string             // YouTube's internal id (e.g. dQw4w9WgXcQ)
  url: string                 // https://youtu.be/<videoId>
  status: { uploadStatus: string; privacyStatus: string }
}

export class YouTubePublishError extends Error {
  constructor(message: string, public stage: 'metadata' | 'upload' | 'status', public body?: any) {
    super(`YouTube publish failed at ${stage}: ${message}`)
  }
}

export async function publishYouTubeVideo(
  input: YouTubePublishInput,
  creds: YouTubeCredentials,
): Promise<YouTubePublishResult> {
  // Basic client-side validation
  const title = (input.title || '').slice(0, 100)
  if (!title) throw new Error('YouTube video title is required')
  const description = (input.description || '').slice(0, 5000)

  const stat = fs.statSync(input.videoPath)
  const fileSize = stat.size

  // ── Step 1: Initiate resumable upload ──────────────────────────────
  const metadata = {
    snippet: {
      title,
      description,
      tags: input.tags?.slice(0, 500),
      categoryId: input.categoryId || '22',
      defaultLanguage: input.defaultLanguage || 'en',
      defaultAudioLanguage: input.defaultAudioLanguage || 'en',
    },
    status: {
      privacyStatus: input.privacyStatus || 'public',
      selfDeclaredMadeForKids: input.madeForKids ?? false,
      embeddable: true,
      publicStatsViewable: true,
    },
  }

  const initRes = await fetch(
    `${YT_UPLOAD}?uploadType=resumable&part=snippet,status`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': fileSize.toString(),
      },
      body: JSON.stringify(metadata),
    },
  )

  if (!initRes.ok) {
    const body = await initRes.json().catch(() => ({}))
    throw new YouTubePublishError(
      body?.error?.message || `HTTP ${initRes.status}`,
      'metadata',
      body,
    )
  }

  const uploadUrl = initRes.headers.get('Location')
  if (!uploadUrl) {
    throw new YouTubePublishError('Missing upload URL in response Location header', 'metadata')
  }

  // ── Step 2: Upload the actual bytes ────────────────────────────────
  const videoBytes = fs.readFileSync(input.videoPath)

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': fileSize.toString(),
    },
    body: videoBytes,
  })

  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => '')
    throw new YouTubePublishError(
      `HTTP ${uploadRes.status} — ${body.slice(0, 200)}`,
      'upload',
    )
  }

  const result: any = await uploadRes.json()
  const videoId = result.id
  if (!videoId) {
    throw new YouTubePublishError('Upload succeeded but no video id returned', 'upload', result)
  }

  // ── Step 3: Verify upload status ────────────────────────────────────
  const statusRes = await fetch(
    `${YT_BASE}?part=status&id=${encodeURIComponent(videoId)}`,
    { headers: { 'Authorization': `Bearer ${creds.accessToken}` } },
  )
  const statusBody: any = statusRes.ok ? await statusRes.json() : null
  const uploadStatus = statusBody?.items?.[0]?.status?.uploadStatus || 'unknown'

  return {
    videoId,
    url: `https://youtu.be/${videoId}`,
    status: {
      uploadStatus,
      privacyStatus: statusBody?.items?.[0]?.status?.privacyStatus || input.privacyStatus || 'public',
    },
  }
}

/**
 * Update an existing video's metadata (title, description, tags, privacy).
 * Useful for fixing typos or scheduling a public release of an unlisted video.
 */
export async function updateYouTubeVideo(
  videoId: string,
  patch: Partial<YouTubePublishInput>,
  creds: { accessToken: string },
) {
  if (!creds.accessToken) throw new Error('YouTube access token required')

  const part = Object.keys(patch).filter(k => ['title', 'description', 'tags', 'categoryId', 'privacyStatus', 'madeForKids'].includes(k))
  const body: any = { id: videoId }
  if (patch.title || patch.description || patch.tags || patch.categoryId) {
    body.snippet = {
      title: patch.title?.slice(0, 100),
      description: patch.description?.slice(0, 5000),
      tags: patch.tags?.slice(0, 500),
      categoryId: patch.categoryId,
    }
  }
  if (patch.privacyStatus || patch.madeForKids !== undefined) {
    body.status = {
      privacyStatus: patch.privacyStatus,
      selfDeclaredMadeForKids: patch.madeForKids,
    }
  }
  const res = await fetch(`${YT_BASE}?part=${part.join(',')}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${creds.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new YouTubePublishError(errBody?.error?.message || `HTTP ${res.status}`, 'status', errBody)
  }
  return await res.json()
}
