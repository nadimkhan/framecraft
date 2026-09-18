import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

/**
 * POST /api/onboarding/save
 * Saves each step of the onboarding wizard.
 * Step is inferred from which fields are present in the body.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Ensure config row exists (singleton)
    let config = await prisma.channelConfig.findFirst()
    if (!config) {
      config = await prisma.channelConfig.create({ data: {} })
    }

    // === STEP: Niche ===
    if (body.nicheId !== undefined) {
      const updated = await prisma.channelConfig.update({
        where: { id: config.id },
        data: { nicheId: body.nicheId },
      })
      return NextResponse.json({ success: true, step: 'niche', config: updated })
    }

    // === STEP: Voice ===
    if (body.voiceStyleId !== undefined) {
      const updated = await prisma.channelConfig.update({
        where: { id: config.id },
        data: { voiceStyleId: body.voiceStyleId },
      })
      return NextResponse.json({ success: true, step: 'voice', config: updated })
    }

    // === STEP: Music ===
    if (body.backgroundMusicIds !== undefined || body.customMusicPaths !== undefined || body.backgroundMusicId !== undefined) {
      const musicData: any = {}
      // Support both new array shape and old single-id shape (for backward compat)
      if (body.backgroundMusicIds !== undefined) {
        musicData.backgroundMusicIds = body.backgroundMusicIds
      } else if (body.backgroundMusicId !== undefined) {
        musicData.backgroundMusicIds = body.backgroundMusicId ? [body.backgroundMusicId] : []
      }
      if (body.customMusicPaths !== undefined) {
        musicData.customMusicPaths = body.customMusicPaths
      } else if (body.customMusicPath !== undefined) {
        musicData.customMusicPaths = body.customMusicPath ? [body.customMusicPath] : []
      }
      const updated = await prisma.channelConfig.update({
        where: { id: config.id },
        data: musicData,
      })
      return NextResponse.json({ success: true, step: 'music', config: updated })
    }

    // === STEP: Art Style ===
    if (body.artStyleId !== undefined) {
      const updated = await prisma.channelConfig.update({
        where: { id: config.id },
        data: { artStyleId: body.artStyleId },
      })
      return NextResponse.json({ success: true, step: 'art-style', config: updated })
    }

    // === STEP: Effects ===
    if (body.effectIds !== undefined) {
      const updated = await prisma.channelConfig.update({
        where: { id: config.id },
        data: { effectIds: body.effectIds },
      })
      return NextResponse.json({ success: true, step: 'effects', config: updated })
    }

    // === STEP: Socials ===
    // Legacy path: legacy clients POST raw tokens here. New clients should
    // use the OAuth flow at /api/oauth/[platform]/start instead.
    if (body.socials !== undefined) {
      for (const account of body.socials) {
        await prisma.socialAccount.upsert({
          where: {
            platform_externalId: {
              platform: account.platform,
              externalId: account.accountId || account.externalId || 'unknown',
            },
          },
          update: {
            channelConfigId: config.id,
            displayName: account.accountName || account.displayName || 'Unknown',
            profileImageUrl: account.profileImageUrl ?? null,
            accessToken: account.accessToken ?? null,
            refreshToken: account.refreshToken ?? null,
            expiresAt: account.expiresAt ? new Date(account.expiresAt) : null,
            status: account.status ?? 'connected',
            metadata: account.metadata ?? null,
          },
          create: {
            channelConfigId: config.id,
            platform: account.platform,
            externalId: account.accountId || account.externalId || 'unknown',
            displayName: account.accountName || account.displayName || 'Unknown',
            profileImageUrl: account.profileImageUrl ?? null,
            accessToken: account.accessToken ?? null,
            refreshToken: account.refreshToken ?? null,
            expiresAt: account.expiresAt ? new Date(account.expiresAt) : null,
            status: account.status ?? 'connected',
            userId: 'default',
            metadata: account.metadata ?? null,
          },
        })
      }
      return NextResponse.json({ success: true, step: 'socials' })
    }

    // === STEP: Series / Content Settings ===
    if (body.series !== undefined) {
      const { contentMode, videoDuration, videosPerDay, publishTimes } = body.series
      const updated = await prisma.channelConfig.update({
        where: { id: config.id },
        data: {
          contentMode: contentMode ?? 'single',
          videoDuration: videoDuration ?? 'short_30_40',
          videosPerDay: videosPerDay ?? 1,
          publishTimes: publishTimes ?? [],
        },
      })
      return NextResponse.json({ success: true, step: 'series', config: updated })
    }

    // === COMPLETE ===
    if (body.complete === true) {
      const updated = await prisma.channelConfig.update({
        where: { id: config.id },
        data: { onboardingCompleted: true },
      })
      return NextResponse.json({ success: true, step: 'done', config: updated })
    }

    return NextResponse.json({ error: 'No valid step data provided' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
