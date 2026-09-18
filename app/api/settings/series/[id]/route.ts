import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const series = await prisma.series.findUnique({
    where: { id },
    include: {
      niche: true,
      artStyle: true,
      voiceStyle: true,
      _count: { select: { sceneStyles: true } },
    },
  })
  if (!series) return NextResponse.json({ error: "Not found" }, { status: 404 })
  // Hide token values from the GET response — the UI only needs to know
  // whether they're set, not the actual secrets.
  const { youtubeAccessToken, youtubeRefreshToken, instagramAccessToken, ...safe } = series as any
  return NextResponse.json({
    series: {
      ...safe,
      // Replace tokens with a sentinel so the UI can show "configured" state
      // without exposing secrets over the wire.
      youtubeAccessToken: youtubeAccessToken ? '••••••••' : null,
      youtubeRefreshToken: youtubeRefreshToken ? '••••••••' : null,
      instagramAccessToken: instagramAccessToken ? '••••••••' : null,
    },
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { seriesName, slug, description, nicheId, artStyleId, voiceStyleId,
          backgroundMusicIds, customMusicPaths, effectIds, contentMode,
          videoDuration, videosPerDay, publishTimes,
          youtubeChannelId, youtubeChannelName, youtubeAccessToken, youtubeRefreshToken,
          instagramAccountId, instagramAccountName, instagramAccessToken } = body

  const data: any = {}
  if (seriesName !== undefined) data.seriesName = seriesName
  if (slug !== undefined) data.slug = slug
  if (description !== undefined) data.description = description
  if (nicheId !== undefined) data.nicheId = nicheId
  if (artStyleId !== undefined) data.artStyleId = artStyleId
  if (voiceStyleId !== undefined) data.voiceStyleId = voiceStyleId
  if (backgroundMusicIds !== undefined) data.backgroundMusicIds = backgroundMusicIds
  if (customMusicPaths !== undefined) data.customMusicPaths = customMusicPaths
  if (effectIds !== undefined) data.effectIds = effectIds
  if (contentMode !== undefined) data.contentMode = contentMode
  if (videoDuration !== undefined) data.videoDuration = videoDuration
  if (videosPerDay !== undefined) data.videosPerDay = videosPerDay
  if (publishTimes !== undefined) data.publishTimes = publishTimes
  // ── Social account credentials ────────────────────────────────
  if (youtubeChannelId !== undefined) data.youtubeChannelId = youtubeChannelId || null
  if (youtubeChannelName !== undefined) data.youtubeChannelName = youtubeChannelName || null
  if (youtubeAccessToken !== undefined) data.youtubeAccessToken = youtubeAccessToken || null
  if (youtubeRefreshToken !== undefined) data.youtubeRefreshToken = youtubeRefreshToken || null
  if (instagramAccountId !== undefined) data.instagramAccountId = instagramAccountId || null
  if (instagramAccountName !== undefined) data.instagramAccountName = instagramAccountName || null
  if (instagramAccessToken !== undefined) data.instagramAccessToken = instagramAccessToken || null

  const updated = await prisma.series.update({
    where: { id },
    data,
    include: { niche: true, artStyle: true, voiceStyle: true },
  })
  return NextResponse.json({ series: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.series.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
