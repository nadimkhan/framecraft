import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decryptToken } from '@/lib/crypto'

/**
 * GET /api/social/accounts?channelConfigId=...
 *
 * List all social accounts linked to a channel config. Tokens are NOT returned
 * — only the metadata fields the UI needs to render connection cards.
 */
export async function GET(request: NextRequest) {
  const channelConfigId = request.nextUrl.searchParams.get('channelConfigId')
  if (!channelConfigId) {
    return NextResponse.json(
      { error: 'channelConfigId query param is required' },
      { status: 400 },
    )
  }

  const accounts = await prisma.socialAccount.findMany({
    where: { channelConfigId },
    orderBy: [{ platform: 'asc' }, { createdAt: 'desc' }],
  })

  // Map to a UI-safe shape — never leak tokens or encrypted blobs.
  const safe = accounts.map((a) => ({
    platform: a.platform,
    externalId: a.externalId,
    displayName: a.displayName,
    profileImageUrl: a.profileImageUrl,
    status: a.status,
    expiresAt: a.expiresAt,
    lastVerifiedAt: a.lastVerifiedAt,
    lastErrorAt: a.lastErrorAt,
    lastErrorMessage: a.lastErrorMessage,
    scopes: a.scopes,
    createdAt: a.createdAt,
  }))

  return NextResponse.json({ accounts: safe })
}

/**
 * DELETE /api/social/accounts
 * Body: { platform, externalId, channelConfigId }
 *
 * Disconnect (revoke) a social account. Deletes the row. Optionally also
 * tries to revoke the token at the platform so the user has to re-consent
 * if they reconnect — but that's a best-effort call, the local delete always
 * succeeds.
 */
export async function DELETE(request: NextRequest) {
  const body = await request.json()
  const { platform, externalId, channelConfigId } = body as {
    platform: string; externalId: string; channelConfigId: string
  }
  if (!platform || !externalId || !channelConfigId) {
    return NextResponse.json(
      { error: 'platform, externalId, channelConfigId are required' },
      { status: 400 },
    )
  }

  // Best-effort token revocation — the local delete always proceeds.
  try {
    const account = await prisma.socialAccount.findUnique({
      where: { platform_externalId: { platform: platform as any, externalId } },
    })
    if (account?.accessToken) {
      const token = decryptToken(account.accessToken)
      await revokeTokenAtPlatform(platform, token).catch((e) =>
        console.warn(`[social] revoke at ${platform} failed:`, e?.message),
      )
    }
  } catch (e: any) {
    console.warn('[social] could not read token for revocation:', e?.message)
  }

  await prisma.socialAccount.delete({
    where: { platform_externalId: { platform: platform as any, externalId } },
  })

  return NextResponse.json({ success: true })
}

async function revokeTokenAtPlatform(platform: string, token: string): Promise<void> {
  if (platform === 'youtube') {
    // Google: https://oauth2.googleapis.com/revoke?token=...
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
  } else if (platform === 'instagram') {
    // FB: DELETE /v20.0/me/permissions
    await fetch(
      `https://graph.facebook.com/v20.0/me/permissions?access_token=${encodeURIComponent(token)}`,
      { method: 'DELETE' },
    )
  }
}
