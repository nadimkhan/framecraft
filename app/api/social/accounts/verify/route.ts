import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decryptToken } from '@/lib/crypto'

/**
 * POST /api/social/accounts/verify
 * Body: { platform, externalId }
 *
 * Actively probes the platform API to confirm the stored token still works.
 * Updates lastVerifiedAt on success or lastErrorMessage on failure.
 *
 * Returns:
 *   { ok: true,  displayName, profileImageUrl, scopes }
 *   { ok: false, error, status: 'connected' | 'error' }
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { platform, externalId } = body as { platform: string; externalId: string }
  if (!platform || !externalId) {
    return NextResponse.json(
      { error: 'platform and externalId required' },
      { status: 400 },
    )
  }

  const account = await prisma.socialAccount.findUnique({
    where: { platform_externalId: { platform: platform as any, externalId } },
  })
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }
  if (!account.accessToken) {
    return NextResponse.json(
      { ok: false, error: 'No access token stored' },
      { status: 200 },
    )
  }

  const accessToken = decryptToken(account.accessToken)
  let ok = false
  let errorMsg: string | null = null

  try {
    if (platform === 'youtube') {
      // Cheap probe: list my channels with the stored token
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id&mine=true&access_token=${encodeURIComponent(accessToken)}`,
      )
      if (res.ok) {
        const data = await res.json()
        ok = Array.isArray(data.items) && data.items.length > 0
        if (!ok) errorMsg = 'No YouTube channels accessible with this token'
      } else {
        errorMsg = `YouTube API returned ${res.status}`
      }
    } else if (platform === 'instagram') {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
      )
      if (res.ok) ok = true
      else errorMsg = `Meta API returned ${res.status}`
    } else {
      return NextResponse.json({ error: 'Unknown platform' }, { status: 400 })
    }
  } catch (e: any) {
    errorMsg = e?.message || 'Verification request failed'
  }

  // Update the row with the verification result
  await prisma.socialAccount.update({
    where: { platform_externalId: { platform: platform as any, externalId } },
    data: ok
      ? {
          status: 'connected',
          lastVerifiedAt: new Date(),
          lastErrorAt: null,
          lastErrorMessage: null,
        }
      : {
          status: 'error',
          lastErrorAt: new Date(),
          lastErrorMessage: errorMsg,
        },
  })

  return NextResponse.json({
    ok,
    error: errorMsg,
    displayName: account.displayName,
    profileImageUrl: account.profileImageUrl,
    scopes: account.scopes,
    status: ok ? 'connected' : 'error',
  })
}
