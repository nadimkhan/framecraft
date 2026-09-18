import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

// GET /api/settings/niches/[id] — niche + its ChannelConfig
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const nicheId = parseInt(id)
    if (isNaN(nicheId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    const niche = await prisma.niche.findUnique({
      where: { id: nicheId },
      include: {},
    })
    if (!niche) return NextResponse.json({ error: 'niche not found' }, { status: 404 })
    const config = await prisma.channelConfig.findUnique({ where: { nicheId } })
    return NextResponse.json({
      niche,
      config: config ?? null,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT /api/settings/niches/[id] — upsert ChannelConfig fields for this niche
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const nicheId = parseInt(id)
    if (isNaN(nicheId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    const body = await request.json()
    const data: any = {}
    if (body.artStyleId !== undefined) data.artStyleId = body.artStyleId
    if (body.voiceStyleId !== undefined) data.voiceStyleId = body.voiceStyleId
    if (body.backgroundMusicIds !== undefined) data.backgroundMusicIds = body.backgroundMusicIds
    if (body.customMusicPaths !== undefined) data.customMusicPaths = body.customMusicPaths
    if (body.effectIds !== undefined) data.effectIds = body.effectIds
    if (body.youtubeChannelId !== undefined) data.youtubeChannelId = body.youtubeChannelId
    if (body.youtubeChannelName !== undefined) data.youtubeChannelName = body.youtubeChannelName
    if (body.instagramAccountId !== undefined) data.instagramAccountId = body.instagramAccountId
    if (body.instagramAccountName !== undefined) data.instagramAccountName = body.instagramAccountName
    if (body.instagramAccessToken !== undefined) data.instagramAccessToken = body.instagramAccessToken
    if (body.instagramTokenExpiresAt !== undefined) {
      data.instagramTokenExpiresAt = body.instagramTokenExpiresAt ? new Date(body.instagramTokenExpiresAt) : null
    }
    if (body.contentMode !== undefined) data.contentMode = body.contentMode
    if (body.videoDuration !== undefined) data.videoDuration = body.videoDuration
    if (body.videosPerDay !== undefined) data.videosPerDay = body.videosPerDay
    if (body.publishTimes !== undefined) data.publishTimes = body.publishTimes
    if (body.onboardingCompleted !== undefined) data.onboardingCompleted = body.onboardingCompleted

    const config = await prisma.channelConfig.upsert({
      where: { nicheId },
      create: { nicheId, ...data },
      update: data,
    })
    return NextResponse.json({ config })
  } catch (error: any) {
    if (error.code === 'P2002') return NextResponse.json({ error: 'duplicate' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/settings/niches/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const nicheId = parseInt(id)
    if (isNaN(nicheId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    // Block delete if any Video row references this niche (videos are linked via batch.series → niche)
    const batchesWithNiche = await prisma.batch.findMany({
      where: { configJson: { path: ['nicheId'], equals: nicheId } },
      take: 1,
    })
    if (batchesWithNiche.length > 0) {
      return NextResponse.json(
        { error: `Cannot delete: a batch already references this niche. Reassign first.` },
        { status: 409 }
      )
    }
    // Also delete all Series that belong to this Niche (cascades to their SceneStyles)
    await prisma.series.deleteMany({ where: { nicheId } })
    await prisma.channelConfig.deleteMany({ where: { nicheId } })
    await prisma.niche.delete({ where: { id: nicheId } })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    if (error.code === 'P2025') return NextResponse.json({ error: 'niche not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
