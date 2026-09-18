import fs from 'fs'

/**
 * Instagram publishing via the Meta Graph API.
 *
 * Two-step flow:
 *   1. POST /v20.0/{ig-user-id}/media — upload the video as a REELS container
 *      (media_type=REELS, video_url must be publicly reachable)
 *   2. POST /v20.0/{ig-user-id}/media_publish — publish the container
 *
 * The Instagram API requires the video to be hosted at a public URL. For
 * localhost-only deployments, configure NEXT_PUBLIC_VIDEO_CDN env var to
 * point at a public host (ngrok, S3+CDN, etc.).
 *
 * Scope requirements (set during App Review in Meta dashboard):
 *   - instagram_basic
 *   - instagram_content_publish
 *   - pages_show_list
 *   - pages_manage_posts
 */

const GRAPH_API = 'https://graph.facebook.com/v20.0'

export interface InstagramCredentials {
  igUserId: string
  accessToken: string
}

export interface InstagramPublishInput {
  /** Public URL of the video (Instagram fetches it from here) */
  videoUrl: string
  /** Caption text. Use newlines for readability. Hashtags allowed. */
  caption: string
  /** Optional cover image URL (thumbnail for the reel before play) */
  coverUrl?: string
}

export interface InstagramPublishResult {
  /** Media container id returned from step 1 */
  creationId: string
  /** Media id returned from step 2 — this is the published post */
  mediaId: string
  /** Public permalink URL returned by the Graph API */
  permalink: string
}

export class InstagramPublishError extends Error {
  constructor(message: string, public step: 'create_container' | 'poll' | 'publish', public body?: any) {
    super(`Instagram publish failed at ${step}: ${message}`)
  }
}

export async function publishInstagramReel(
  input: InstagramPublishInput,
  creds: InstagramCredentials,
): Promise<InstagramPublishResult> {
  if (!creds.igUserId) throw new Error('Instagram user ID required')
  if (!creds.accessToken) throw new Error('Instagram access token required')

  const igUserId = creds.igUserId
  const token = creds.accessToken

  // ── Step 1: Create the media container ─────────────────────────────
  // media_type=REELS tells the API this is an Instagram Reel (vertical, ≤90s,
  // 9:16 aspect ratio preferred).
  const containerParams = new URLSearchParams({
    media_type: 'REELS',
    video_url: input.videoUrl,
    caption: input.caption,
    access_token: token,
  })
  if (input.coverUrl) containerParams.set('cover_url', input.coverUrl)

  const createRes = await fetch(`${GRAPH_API}/${igUserId}/media?${containerParams}`, {
    method: 'POST',
  })
  const createBody: any = await createRes.json()
  if (!createRes.ok || !createBody.id) {
    throw new InstagramPublishError(
      createBody?.error?.message || `HTTP ${createRes.status}`,
      'create_container',
      createBody,
    )
  }
  const creationId = createBody.id as string

  // ── Step 2: Poll until the container is FINISHED ───────────────────
  // Instagram transcodes the video server-side. Container status must reach
  // FINISHED before we can publish. Typical wait: 5-30 seconds.
  const finished = await pollContainerStatus(igUserId, creationId, token)
  if (!finished) {
    throw new InstagramPublishError('Container did not reach FINISHED state in time', 'poll')
  }

  // ── Step 3: Publish the container ─────────────────────────────────
  const publishRes = await fetch(`${GRAPH_API}/${igUserId}/media_publish?` + new URLSearchParams({
    creation_id: creationId,
    access_token: token,
  }), { method: 'POST' })
  const publishBody: any = await publishRes.json()
  if (!publishRes.ok || !publishBody.id) {
    throw new InstagramPublishError(
      publishBody?.error?.message || `HTTP ${publishRes.status}`,
      'publish',
      publishBody,
    )
  }
  // Fetch the published media to get its public permalink
  const mediaRes = await fetch(
    `${GRAPH_API}/${publishBody.id}?fields=permalink&access_token=${encodeURIComponent(token)}`,
  )
  const mediaData: any = await mediaRes.json()
  const permalink: string = mediaData.permalink || `https://www.instagram.com/p/${publishBody.id}/`

  return { creationId, mediaId: publishBody.id as string, permalink }
}

async function pollContainerStatus(
  igUserId: string,
  containerId: string,
  token: string,
  opts: { maxWaitSec?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const maxWaitMs = (opts.maxWaitSec ?? 90) * 1000
  const intervalMs = opts.intervalMs ?? 3000
  const deadline = Date.now() + maxWaitMs

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs))
    const res = await fetch(
      `${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,
    )
    const body: any = await res.json()
    const code = body.status_code
    if (code === 'FINISHED') return true
    if (code === 'ERROR') {
      throw new InstagramPublishError(
        body.status || `Container error: ${code}`,
        'poll',
        body,
      )
    }
    // IN_PROGRESS — keep polling
  }
  return false
}

/**
 * Fetch the account's recent posts to find a video's permalink / status.
 * Useful for verifying the publish worked and updating the DB with the post URL.
 */
export async function getInstagramMedia(mediaId: string, accessToken: string) {
  const url = `${GRAPH_API}/${mediaId}?fields=id,media_type,media_url,permalink,thumbnail_url,timestamp,caption&access_token=${encodeURIComponent(accessToken)}`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new InstagramPublishError(
      body?.error?.message || `HTTP ${res.status}`,
      'publish',
      body,
    )
  }
  return await res.json()
}

/**
 * Upload helper: read a local file and base64-encode it. Not currently used
 * since IG requires a PUBLIC URL, but kept here as a reference for future
 * work to integrate with an upload service (e.g. S3 presigned URL).
 */
export function readVideoAsBase64(localPath: string): string {
  const buf = fs.readFileSync(localPath)
  return buf.toString('base64')
}
